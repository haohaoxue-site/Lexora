import type {
  SystemEmailConfig,
  SystemEmailProvider,
  SystemEmailServiceStatus,
  TestSystemEmailConfigResponse,
  UpdateSystemEmailConfigRequest,
  UpdateSystemEmailServiceStatusRequest,
} from '@haohaoxue/samepage-contracts'
import type { CryptoConfig } from '../../config/auth.config'
import { SYSTEM_EMAIL_PROVIDER_DEFAULTS } from '@haohaoxue/samepage-contracts'
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, SystemEmailProvider as PrismaSystemEmailProvider } from '@prisma/client'
import { createTransport } from 'nodemailer'
import { PrismaService } from '../../database/prisma.service'
import { decryptAes256Gcm, encryptAes256Gcm, isEncryptedValue } from '../../utils/crypto'
import { auditUserSummarySelect, toAuditUserSummary } from '../users/audit-user-summary'
import {
  createDefaultSystemEmailConfig,
  normalizeSystemEmailEditableFields,
  toSystemEmailConfig,
  toSystemEmailServiceStatus,
} from './system-email.utils'

const systemEmailConfigInclude = {
  updatedByUser: {
    select: auditUserSummarySelect,
  },
} satisfies Prisma.SystemEmailConfigInclude

@Injectable()
export class SystemEmailService {
  private readonly encryptionKey: string

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.encryptionKey = configService.getOrThrow<CryptoConfig>('crypto').encryptionKey
  }

  async getEmailConfig(): Promise<SystemEmailConfig> {
    const config = await this.prisma.systemEmailConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: systemEmailConfigInclude,
    })

    if (!config) {
      return createDefaultSystemEmailConfig()
    }

    const normalizedFields = normalizeSystemEmailEditableFields({
      smtpHost: config.smtpHost,
      smtpUsername: config.smtpUsername,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
    })

    return toSystemEmailConfig({
      provider: config.provider as SystemEmailProvider,
      smtpHost: normalizedFields.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUsername: normalizedFields.smtpUsername,
      fromName: normalizedFields.fromName,
      fromEmail: normalizedFields.fromEmail,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
      updatedByUser: toAuditUserSummary(config.updatedByUser),
    }, Boolean(this.decryptPassword(config.smtpPasswordEncrypted)))
  }

  async getEmailServiceStatus(): Promise<SystemEmailServiceStatus> {
    const config = await this.prisma.systemEmailConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    })

    return toSystemEmailServiceStatus(config
      ? {
          enabled: config.enabled,
        }
      : null)
  }

  async isEnabled(): Promise<boolean> {
    return (await this.getEmailServiceStatus()).enabled
  }

  async updateEmailConfig(
    actorUserId: string,
    payload: UpdateSystemEmailConfigRequest,
  ): Promise<SystemEmailConfig> {
    const existing = await this.prisma.systemEmailConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    })
    const existingPassword = this.decryptPassword(existing?.smtpPasswordEncrypted ?? null)
    const nextPassword = payload.clearPassword
      ? null
      : payload.smtpPassword?.trim()
        ? payload.smtpPassword.trim()
        : existingPassword
    const normalizedFields = normalizeSystemEmailEditableFields({
      smtpHost: payload.smtpHost,
      smtpUsername: payload.smtpUsername,
      fromName: payload.fromName,
      fromEmail: payload.fromEmail,
    })

    if (existing?.enabled) {
      this.assertEmailServiceReady({
        smtpHost: normalizedFields.smtpHost,
        smtpPort: payload.smtpPort,
        smtpUsername: normalizedFields.smtpUsername,
        fromName: normalizedFields.fromName,
        fromEmail: normalizedFields.fromEmail,
        smtpPassword: nextPassword,
      })
    }

    const data = {
      provider: payload.provider as PrismaSystemEmailProvider,
      enabled: existing?.enabled ?? false,
      smtpHost: normalizedFields.smtpHost,
      smtpPort: payload.smtpPort,
      smtpSecure: payload.smtpSecure,
      smtpUsername: normalizedFields.smtpUsername,
      smtpPasswordEncrypted: nextPassword ? encryptAes256Gcm(nextPassword, this.encryptionKey) : null,
      fromName: normalizedFields.fromName,
      fromEmail: normalizedFields.fromEmail,
      updatedBy: actorUserId,
    }

    if (existing) {
      await this.prisma.systemEmailConfig.update({
        where: { id: existing.id },
        data,
      })
    }
    else {
      await this.prisma.systemEmailConfig.create({
        data: {
          id: 'default',
          ...data,
        },
      })
    }

    return this.getEmailConfig()
  }

  async updateEmailServiceStatus(
    actorUserId: string,
    payload: UpdateSystemEmailServiceStatusRequest,
  ): Promise<SystemEmailServiceStatus> {
    const existing = await this.prisma.systemEmailConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    })
    const normalizedFields = normalizeSystemEmailEditableFields({
      smtpHost: existing?.smtpHost ?? '',
      smtpUsername: existing?.smtpUsername ?? '',
      fromName: existing?.fromName ?? '',
      fromEmail: existing?.fromEmail ?? '',
    })

    if (payload.enabled) {
      this.assertEmailServiceReady({
        smtpHost: normalizedFields.smtpHost,
        smtpPort: existing?.smtpPort ?? 0,
        smtpUsername: normalizedFields.smtpUsername,
        fromName: normalizedFields.fromName,
        fromEmail: normalizedFields.fromEmail,
        smtpPassword: this.decryptPassword(existing?.smtpPasswordEncrypted ?? null),
      })
    }

    if (!existing) {
      return toSystemEmailServiceStatus(null)
    }

    await this.prisma.systemEmailConfig.update({
      where: { id: existing.id },
      data: {
        enabled: payload.enabled,
        updatedBy: actorUserId,
      },
    })

    return this.getEmailServiceStatus()
  }

  async sendTestEmail(recipientEmail: string): Promise<TestSystemEmailConfigResponse> {
    const config = await this.getTransportConfig(false)
    const transport = createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUsername,
        pass: config.smtpPassword,
      },
    })

    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: recipientEmail,
      subject: 'SamePage 发件配置测试',
      html: createSimpleEmailHtml({
        title: '发件配置已生效',
        content: '这是一封来自 SamePage 的测试邮件，说明当前系统发件配置可正常发送。',
      }),
      text: '这是一封来自 SamePage 的测试邮件，说明当前系统发件配置可正常发送。',
    })

    return { sent: true }
  }

  async sendMail(input: {
    to: string
    subject: string
    html: string
    text: string
  }): Promise<void> {
    const config = await this.getTransportConfig(true)
    const transport = createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUsername,
        pass: config.smtpPassword,
      },
    })

    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })
  }

  getProviderDefaults(provider: SystemEmailProvider) {
    return SYSTEM_EMAIL_PROVIDER_DEFAULTS[provider]
  }

  private assertEmailServiceReady(input: {
    smtpHost: string
    smtpPort: number
    smtpUsername: string
    fromName: string
    fromEmail: string
    smtpPassword: string | null
  }) {
    if (
      !input.smtpHost.trim()
      || !Number.isFinite(input.smtpPort)
      || input.smtpPort <= 0
      || !input.smtpUsername.trim()
      || !input.fromName.trim()
      || !input.fromEmail.trim()
    ) {
      throw new BadRequestException('启用发件服务前请先保存完整的 SMTP 配置')
    }

    if (!input.smtpPassword) {
      throw new BadRequestException('启用发件服务前请先填写并保存发件密码')
    }
  }

  private async getTransportConfig(requireEnabled: boolean): Promise<{
    smtpHost: string
    smtpPort: number
    smtpSecure: boolean
    smtpUsername: string
    smtpPassword: string
    fromName: string
    fromEmail: string
  }> {
    const config = await this.prisma.systemEmailConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    })

    if (!config) {
      throw new BadRequestException('系统暂未保存发件配置，请先在后台完成配置')
    }

    if (requireEnabled && !config.enabled) {
      throw new BadRequestException('系统暂未启用发件邮箱，请先在后台完成配置')
    }

    const smtpPassword = this.decryptPassword(config.smtpPasswordEncrypted)

    if (!smtpPassword) {
      throw new BadRequestException('系统发件密码缺失，请先在后台补充配置')
    }

    const normalizedFields = normalizeSystemEmailEditableFields({
      smtpHost: config.smtpHost,
      smtpUsername: config.smtpUsername,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
    })

    if (
      !normalizedFields.smtpHost
      || !normalizedFields.smtpUsername
      || !normalizedFields.fromName
      || !normalizedFields.fromEmail
      || !Number.isFinite(config.smtpPort)
      || config.smtpPort <= 0
    ) {
      throw new BadRequestException('请先保存完整的 SMTP 配置后再发送测试邮件')
    }

    return {
      smtpHost: normalizedFields.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUsername: normalizedFields.smtpUsername,
      smtpPassword,
      fromName: normalizedFields.fromName,
      fromEmail: normalizedFields.fromEmail,
    }
  }

  private decryptPassword(value: string | null | undefined): string | null {
    if (!value) {
      return null
    }

    if (!isEncryptedValue(value)) {
      return value
    }

    return decryptAes256Gcm(value, this.encryptionKey)
  }
}

function createSimpleEmailHtml(input: {
  title: string
  content: string
}) {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.7;">',
    `<h2 style="margin:0 0 16px;">${input.title}</h2>`,
    `<p style="margin:0;">${input.content}</p>`,
    '</div>',
  ].join('')
}
