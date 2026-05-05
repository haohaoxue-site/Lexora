import type { Prisma } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import type { TokenExchangeResult } from './auth.interface'
import { randomInt } from 'node:crypto'
import { AUTH_METHOD } from '@haohaoxue/samepage-contracts'
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { normalizeEmail } from '../../utils/email'
import { sha256Hex } from '../../utils/hash'
import { resolveUniqueUserCode } from '../users/users.utils'
import { PersonalWorkspacesService } from '../workspaces/personal-workspaces.service'
import { AuthMailerService } from './auth-mailer.service'
import { AuthSessionsService } from './auth-sessions.service'
import {
  REGISTRATION_EMAIL_VERIFICATION_RESEND_INTERVAL_MS,
  REGISTRATION_EMAIL_VERIFICATION_TTL_SECONDS,
} from './auth.constants'
import { hashPassword } from './password.utils'
import { SystemAuthService } from './system-auth.service'

@Injectable()
export class AuthRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemAuthService: SystemAuthService,
    private readonly authMailerService: AuthMailerService,
    private readonly personalWorkspacesService: PersonalWorkspacesService,
    private readonly authSessionsService: AuthSessionsService,
  ) {}

  async requestEmailVerification(email: string): Promise<void> {
    await this.systemAuthService.assertRegistrationAllowed(AUTH_METHOD.PASSWORD)

    const normalizedEmail = normalizeEmail(email)
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    if (existingUser) {
      throw new BadRequestException('该邮箱已存在账号，请直接登录')
    }

    const latestVerification = await this.prisma.authEmailVerificationToken.findFirst({
      where: {
        email: normalizedEmail,
        purpose: 'REGISTER_VERIFY',
        consumedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (
      latestVerification
      && Date.now() - latestVerification.createdAt.getTime() < REGISTRATION_EMAIL_VERIFICATION_RESEND_INTERVAL_MS
    ) {
      throw new BadRequestException('验证码发送过于频繁，请稍后再试')
    }

    await this.prisma.authEmailVerificationToken.updateMany({
      where: {
        email: normalizedEmail,
        purpose: 'REGISTER_VERIFY',
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    })

    const code = String(randomInt(100000, 1000000))

    await this.prisma.authEmailVerificationToken.create({
      data: {
        email: normalizedEmail,
        tokenHash: sha256Hex(code),
        purpose: 'REGISTER_VERIFY',
        expiresAt: new Date(Date.now() + REGISTRATION_EMAIL_VERIFICATION_TTL_SECONDS * 1000),
      },
    })

    await this.authMailerService.sendRegistrationCodeEmail({
      email: normalizedEmail,
      code,
    })
  }

  async registerWithPassword(
    email: string,
    code: string,
    displayName: string,
    password: string,
    request: FastifyRequest,
  ): Promise<TokenExchangeResult> {
    const normalizedDisplayName = displayName.trim()

    if (!normalizedDisplayName.length) {
      throw new BadRequestException('显示名称不能为空')
    }

    await this.systemAuthService.assertRegistrationAllowed(AUTH_METHOD.PASSWORD)
    const passwordHash = await hashPassword(password)

    const user = await this.prisma.$transaction(async (tx) => {
      const { email: verifiedEmail } = await this.consumeRegistrationVerificationCode(email, code, tx)
      const existingUser = await tx.user.findUnique({
        where: { email: verifiedEmail },
        select: { id: true },
      })

      if (existingUser) {
        throw new BadRequestException('该邮箱已存在账号，请直接登录')
      }

      const userCode = await resolveUniqueUserCode({
        isUserCodeTaken: async candidate =>
          Boolean(await tx.user.findUnique({
            where: { userCode: candidate },
            select: { id: true },
          })),
      })

      const createdUser = await tx.user.create({
        data: {
          email: verifiedEmail,
          displayName: normalizedDisplayName,
          userCode,
        },
      })

      await this.personalWorkspacesService.provisionPersonalWorkspaceForUser({
        userId: createdUser.id,
        userCode: createdUser.userCode,
      }, tx)

      await tx.localCredential.create({
        data: {
          userId: createdUser.id,
          passwordHash,
          emailVerifiedAt: new Date(),
          passwordUpdatedAt: new Date(),
        },
      })

      return createdUser
    })

    return this.authSessionsService.issueAuthSession(user.id, request)
  }

  private async consumeRegistrationVerificationCode(
    email: string,
    code: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ email: string }> {
    const normalizedEmail = normalizeEmail(email)
    const normalizedCode = code.trim()
    const token = await tx.authEmailVerificationToken.findFirst({
      where: {
        email: normalizedEmail,
        purpose: 'REGISTER_VERIFY',
        consumedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!token || token.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('验证码已失效，请重新获取')
    }

    if (token.tokenHash !== sha256Hex(normalizedCode)) {
      throw new BadRequestException('验证码错误')
    }

    const consumed = await tx.authEmailVerificationToken.updateMany({
      where: {
        id: token.id,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    })

    if (consumed.count !== 1) {
      throw new BadRequestException('验证码已失效，请重新获取')
    }

    return {
      email: token.email,
    }
  }
}
