import type { AuthMethodName } from '@haohaoxue/samepage-contracts'
import type { LocalCredential, SystemAuthConfig, User } from '@prisma/client'
import type { BootstrapConfig } from '../../config/auth.config'
import { randomBytes } from 'node:crypto'
import { AUTH_METHOD, AUTH_PASSWORD_MAX_LENGTH } from '@haohaoxue/samepage-contracts'
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../database/prisma.service'
import { RbacService } from '../rbac/rbac.service'
import { SystemEmailService } from '../system-email/system-email.service'
import { resolveUniqueUserCode } from '../users/users.utils'
import { PersonalWorkspacesService } from '../workspaces/personal-workspaces.service'
import { hashPassword } from './password.utils'

const SYSTEM_AUTH_CONFIG_ID = 'default'
const SYSTEM_ADMIN_INITIAL_PASSWORD_PREFIX = 'Aa1'

export interface RegistrationOptions {
  allowPasswordRegistration: boolean
  allowGithubRegistration: boolean
  allowLinuxDoRegistration: boolean
}

@Injectable()
export class SystemAuthService implements OnModuleInit {
  private readonly logger = new Logger(SystemAuthService.name)
  private readonly bootstrapConfig: BootstrapConfig

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
    private readonly systemEmailService: SystemEmailService,
    private readonly personalWorkspacesService: PersonalWorkspacesService,
    configService: ConfigService,
  ) {
    this.bootstrapConfig = configService.getOrThrow<BootstrapConfig>('bootstrap')
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSystemAdminBootstrap()
  }

  async ensureSystemAdminBootstrap(): Promise<void> {
    const config = await this.getOrCreateConfig()
    const systemAdminEmail = this.bootstrapConfig.systemAdminEmail
    const existingSystemAdminUserId = config.systemAdminUserId
    const user = await this.ensureSystemAdminUser(systemAdminEmail)
    const localCredential = await this.ensureSystemAdminCredential(user.id)

    await this.prisma.systemAuthConfig.update({
      where: { id: SYSTEM_AUTH_CONFIG_ID },
      data: {
        systemAdminEmail,
        systemAdminUserId: user.id,
      },
    })

    await this.rbacService.ensureDefaultUserRole(user.id)
    await this.rbacService.enforceSystemAdminRole(user.id)

    if (localCredential.createdInitialPassword) {
      this.logger.log(`System admin initialized: ${systemAdminEmail}`)
      this.logger.warn(`System admin initial password: ${localCredential.initialPassword}`)
    }

    if (existingSystemAdminUserId && existingSystemAdminUserId !== user.id) {
      await this.rbacService.revokeSystemAdminRole(existingSystemAdminUserId)
    }
  }

  async getRegistrationOptions(): Promise<RegistrationOptions> {
    const config = await this.getOrCreateConfig()

    return {
      allowPasswordRegistration: config.allowPasswordRegistration,
      allowGithubRegistration: config.allowGithubRegistration,
      allowLinuxDoRegistration: config.allowLinuxDoRegistration,
    }
  }

  async getGovernanceSnapshot(): Promise<{
    config: SystemAuthConfig
    systemAdminUser: Pick<User, 'id' | 'email' | 'displayName' | 'lastLoginAt'> | null
    localCredential: Pick<LocalCredential, 'mustChangePassword' | 'passwordUpdatedAt'> | null
  }> {
    const config = await this.getOrCreateConfig()
    const systemAdminUser = config.systemAdminUserId
      ? await this.prisma.user.findUnique({
          where: { id: config.systemAdminUserId },
          select: {
            id: true,
            email: true,
            displayName: true,
            lastLoginAt: true,
          },
        })
      : null

    const localCredential = config.systemAdminUserId
      ? await this.prisma.localCredential.findUnique({
          where: { userId: config.systemAdminUserId },
          select: {
            mustChangePassword: true,
            passwordUpdatedAt: true,
          },
        })
      : null

    return {
      config,
      systemAdminUser,
      localCredential,
    }
  }

  async updateRegistrationOptions(
    updatedBy: string,
    payload: Partial<RegistrationOptions>,
  ): Promise<SystemAuthConfig> {
    await this.getOrCreateConfig()

    return this.prisma.systemAuthConfig.update({
      where: { id: SYSTEM_AUTH_CONFIG_ID },
      data: {
        ...payload,
        updatedBy,
      },
    })
  }

  async assertRegistrationAllowed(method: AuthMethodName): Promise<void> {
    const options = await this.getRegistrationOptions()

    if (method === AUTH_METHOD.PASSWORD) {
      if (!options.allowPasswordRegistration || !(await this.systemEmailService.isEnabled())) {
        throw new BadRequestException('当前未开放邮箱密码注册')
      }

      return
    }

    if (method === AUTH_METHOD.GITHUB && !options.allowGithubRegistration) {
      throw new BadRequestException('当前未开放 GitHub 注册')
    }

    if (method === AUTH_METHOD.LINUX_DO && !options.allowLinuxDoRegistration) {
      throw new BadRequestException('当前未开放 LinuxDo 注册')
    }
  }

  async isSystemAdminUser(userId: string): Promise<boolean> {
    const config = await this.getOrCreateConfig()
    return config.systemAdminUserId === userId
  }

  private async ensureSystemAdminUser(email: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase()
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: normalizedEmail,
          status: 'ACTIVE',
          displayName: existingUser.displayName || 'System Admin',
        },
      })

      await this.personalWorkspacesService.provisionPersonalWorkspaceForUser({
        userId: user.id,
        userCode: user.userCode,
      })

      return user
    }

    return this.prisma.$transaction(async (tx) => {
      const userCode = await resolveUniqueUserCode({
        isUserCodeTaken: async candidate =>
          Boolean(await tx.user.findUnique({
            where: { userCode: candidate },
            select: { id: true },
          })),
      })

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: 'System Admin',
          status: 'ACTIVE',
          userCode,
        },
      })

      await this.personalWorkspacesService.provisionPersonalWorkspaceForUser({
        userId: user.id,
        userCode: user.userCode,
      }, tx)

      return user
    })
  }

  private async ensureSystemAdminCredential(userId: string): Promise<{ createdInitialPassword: boolean, initialPassword?: string }> {
    const credential = await this.prisma.localCredential.findUnique({
      where: { userId },
      select: {
        userId: true,
        emailVerifiedAt: true,
      },
    })

    if (credential) {
      if (!credential.emailVerifiedAt) {
        await this.prisma.localCredential.update({
          where: { userId },
          data: {
            emailVerifiedAt: new Date(),
          },
        })
      }

      return { createdInitialPassword: false }
    }

    const initialPassword = this.generateSystemAdminInitialPassword()
    const passwordHash = await hashPassword(initialPassword)

    await this.prisma.localCredential.create({
      data: {
        userId,
        passwordHash,
        mustChangePassword: true,
        emailVerifiedAt: new Date(),
        passwordUpdatedAt: new Date(),
      },
    })

    return {
      createdInitialPassword: true,
      initialPassword,
    }
  }

  private generateSystemAdminInitialPassword(): string {
    return `${SYSTEM_ADMIN_INITIAL_PASSWORD_PREFIX}${randomBytes(AUTH_PASSWORD_MAX_LENGTH).toString('base64url').slice(0, AUTH_PASSWORD_MAX_LENGTH - SYSTEM_ADMIN_INITIAL_PASSWORD_PREFIX.length)}`
  }

  private async getOrCreateConfig(): Promise<SystemAuthConfig> {
    const existing = await this.prisma.systemAuthConfig.findUnique({
      where: { id: SYSTEM_AUTH_CONFIG_ID },
    })

    if (existing) {
      return existing
    }

    try {
      return await this.prisma.systemAuthConfig.create({
        data: {
          id: SYSTEM_AUTH_CONFIG_ID,
          systemAdminEmail: this.bootstrapConfig.systemAdminEmail,
        },
      })
    }
    catch {
      return this.prisma.systemAuthConfig.findUniqueOrThrow({
        where: { id: SYSTEM_AUTH_CONFIG_ID },
      })
    }
  }
}
