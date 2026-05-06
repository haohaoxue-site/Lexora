import type { AuthMethodName } from '@haohaoxue/samepage-contracts'
import type { LocalCredential, SystemAuthConfig, User } from '@prisma/client'
import type { BootstrapConfig, CryptoConfig } from '../../config/auth.config'
import { AUTH_METHOD } from '@haohaoxue/samepage-contracts'
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../database/prisma.service'
import { decryptAes256Gcm, encryptAes256Gcm } from '../../utils/crypto'
import { RbacService } from '../rbac/rbac.service'
import { SystemEmailService } from '../system-email/system-email.service'
import { resolveUniqueUserCode } from '../users/users.utils'
import { PersonalWorkspacesService } from '../workspaces/personal-workspaces.service'
import { hashPassword, verifyPassword } from './password.utils'
import { generateSystemAdminInitialPassword } from './system-admin-password.utils'

const SYSTEM_AUTH_CONFIG_ID = 'default'

export interface RegistrationOptions {
  allowGithubLogin: boolean
  allowLinuxDoLogin: boolean
  allowPasswordRegistration: boolean
  allowGithubRegistration: boolean
  allowLinuxDoRegistration: boolean
  requirePasswordInviteCode: boolean
  requireGithubInviteCode: boolean
  requireLinuxDoInviteCode: boolean
  registrationInviteCodeHash: string | null
}

@Injectable()
export class SystemAuthService implements OnModuleInit {
  private readonly logger = new Logger(SystemAuthService.name)
  private readonly bootstrapConfig: BootstrapConfig
  private readonly encryptionKey: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
    private readonly systemEmailService: SystemEmailService,
    private readonly personalWorkspacesService: PersonalWorkspacesService,
    configService: ConfigService,
  ) {
    this.bootstrapConfig = configService.getOrThrow<BootstrapConfig>('bootstrap')
    this.encryptionKey = configService.getOrThrow<CryptoConfig>('crypto').encryptionKey
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
      allowGithubLogin: config.allowGithubLogin,
      allowLinuxDoLogin: config.allowLinuxDoLogin,
      allowPasswordRegistration: config.allowPasswordRegistration,
      allowGithubRegistration: config.allowGithubRegistration,
      allowLinuxDoRegistration: config.allowLinuxDoRegistration,
      requirePasswordInviteCode: config.requirePasswordInviteCode,
      requireGithubInviteCode: config.requireGithubInviteCode,
      requireLinuxDoInviteCode: config.requireLinuxDoInviteCode,
      registrationInviteCodeHash: config.registrationInviteCodeHash,
    }
  }

  async getGovernanceSnapshot(): Promise<{
    config: SystemAuthConfig
    registrationInviteCode: string | null
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
      registrationInviteCode: this.decryptRegistrationInviteCode(config.registrationInviteCodeEncrypted),
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

  async updateRegistrationInviteCode(
    updatedBy: string,
    inviteCode: string,
  ): Promise<SystemAuthConfig> {
    await this.getOrCreateConfig()
    const normalizedInviteCode = normalizeRegistrationInviteCode(inviteCode)

    if (!normalizedInviteCode) {
      return this.prisma.systemAuthConfig.update({
        where: { id: SYSTEM_AUTH_CONFIG_ID },
        data: {
          registrationInviteCodeHash: null,
          registrationInviteCodeEncrypted: null,
          updatedBy,
        },
      })
    }

    if (normalizedInviteCode.length < 4) {
      throw new BadRequestException('邀请码至少 4 位')
    }

    return this.prisma.systemAuthConfig.update({
      where: { id: SYSTEM_AUTH_CONFIG_ID },
      data: {
        registrationInviteCodeHash: await hashPassword(normalizedInviteCode),
        registrationInviteCodeEncrypted: encryptAes256Gcm(normalizedInviteCode, this.encryptionKey),
        updatedBy,
      },
    })
  }

  async assertOauthProviderLoginAllowed(method: AuthMethodName): Promise<void> {
    const options = await this.getRegistrationOptions()

    if (method === AUTH_METHOD.GITHUB && !options.allowGithubLogin) {
      throw new BadRequestException('当前未开放 GitHub 登录')
    }

    if (method === AUTH_METHOD.LINUX_DO && !options.allowLinuxDoLogin) {
      throw new BadRequestException('当前未开放 LinuxDo 登录')
    }
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

  async isRegistrationInviteCodeRequired(method: AuthMethodName): Promise<boolean> {
    const options = await this.getRegistrationOptions()
    return isRegistrationInviteCodeRequired(method, options)
  }

  async assertRegistrationInviteCode(method: AuthMethodName, inviteCode: string): Promise<void> {
    const options = await this.getRegistrationOptions()

    if (!isRegistrationInviteCodeRequired(method, options)) {
      throw new BadRequestException('当前注册方式不需要邀请码')
    }

    if (!options.registrationInviteCodeHash) {
      throw new BadRequestException('当前注册邀请码未设置')
    }

    if (!(await verifyPassword(normalizeRegistrationInviteCode(inviteCode), options.registrationInviteCodeHash))) {
      throw new BadRequestException('邀请码无效或已变更')
    }
  }

  private decryptRegistrationInviteCode(value: string | null | undefined): string | null {
    if (!value) {
      return null
    }

    return decryptAes256Gcm(value, this.encryptionKey)
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

    const initialPassword = generateSystemAdminInitialPassword()
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

function isRegistrationInviteCodeRequired(
  method: AuthMethodName,
  options: RegistrationOptions,
): boolean {
  if (method === AUTH_METHOD.PASSWORD) {
    return options.requirePasswordInviteCode
  }

  if (method === AUTH_METHOD.GITHUB) {
    return options.requireGithubInviteCode
  }

  if (method === AUTH_METHOD.LINUX_DO) {
    return options.requireLinuxDoInviteCode
  }

  return false
}

function normalizeRegistrationInviteCode(inviteCode: string): string {
  return inviteCode.trim()
}
