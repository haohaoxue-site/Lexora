import { Injectable } from '@nestjs/common'
import { SystemEmailService } from '../system-email/system-email.service'
import { stripHtmlTags } from './html.utils'

interface RegistrationVerificationMailPayload {
  email: string
  code: string
}

interface BindEmailCodeMailPayload {
  email: string
  code: string
}

@Injectable()
export class AuthMailerService {
  constructor(private readonly systemEmailService: SystemEmailService) {}

  async sendRegistrationCodeEmail(payload: RegistrationVerificationMailPayload): Promise<void> {
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.7;">',
      '<h2 style="margin:0 0 16px;">注册验证码</h2>',
      '<p style="margin:0 0 12px;">你正在注册 SamePage，请在页面输入以下验证码：</p>',
      `<p style="margin:0 0 12px;font-size:24px;font-weight:700;letter-spacing:6px;">${payload.code}</p>`,
      '<p style="margin:0;color:#6b7280;">验证码 10 分钟内有效。如非本人操作，请忽略这封邮件。</p>',
      '</div>',
    ].join('')

    await this.systemEmailService.sendMail({
      to: payload.email,
      subject: 'SamePage 注册验证码',
      html,
      text: stripHtmlTags(html),
    })
  }

  async sendBindEmailCodeEmail(payload: BindEmailCodeMailPayload): Promise<void> {
    const html = [
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.7;">',
      '<h2 style="margin:0 0 16px;">邮箱绑定验证码</h2>',
      '<p style="margin:0 0 12px;">你正在绑定 SamePage 登录邮箱，请在页面输入以下验证码：</p>',
      `<p style="margin:0 0 12px;font-size:24px;font-weight:700;letter-spacing:6px;">${payload.code}</p>`,
      '<p style="margin:0;color:#6b7280;">验证码 10 分钟内有效。如非本人操作，请忽略这封邮件。</p>',
      '</div>',
    ].join('')

    await this.systemEmailService.sendMail({
      to: payload.email,
      subject: 'SamePage 邮箱绑定验证码',
      html,
      text: stripHtmlTags(html),
    })
  }
}
