import type { AuthCapabilities as AuthCapabilitiesView } from '@haohaoxue/samepage-contracts'
import type { OAuthConfig, OAuthProviderConfig } from '../../config/auth.config'
import { AUTH_PROVIDER } from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SystemAuthService } from '../auth/system-auth.service'
import { SystemEmailService } from '../system-email/system-email.service'

@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly systemAuthService: SystemAuthService,
    private readonly systemEmailService: SystemEmailService,
    private readonly configService: ConfigService,
  ) {}

  async getAuthCapabilities(): Promise<AuthCapabilitiesView> {
    const [registrationOptions, emailBindingEnabled] = await Promise.all([
      this.systemAuthService.getRegistrationOptions(),
      this.systemEmailService.isEnabled(),
    ])
    const oauthConfig = this.configService.getOrThrow<OAuthConfig>('oauth')
    const githubEnabled = isOAuthProviderEnabled(oauthConfig.github)
    const linuxDoEnabled = isOAuthProviderEnabled(oauthConfig.linuxDo)

    return {
      emailBindingEnabled,
      passwordRegistrationEnabled: emailBindingEnabled && registrationOptions.allowPasswordRegistration,
      providers: {
        [AUTH_PROVIDER.GITHUB]: {
          enabled: githubEnabled,
          allowRegistration: githubEnabled && registrationOptions.allowGithubRegistration,
        },
        [AUTH_PROVIDER.LINUX_DO]: {
          enabled: linuxDoEnabled,
          allowRegistration: linuxDoEnabled && registrationOptions.allowLinuxDoRegistration,
        },
      },
    }
  }
}

function isOAuthProviderEnabled(config: OAuthProviderConfig): boolean {
  return Boolean(config.clientId?.trim() && config.clientSecret?.trim())
}
