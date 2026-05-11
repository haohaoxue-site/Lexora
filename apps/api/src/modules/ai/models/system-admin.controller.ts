import type { AiProvider, AiProviderCredential, AiProviderModelItem, AiProviderModels } from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import { PERMISSIONS } from '@haohaoxue/samepage-contracts'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { RequirePermissions } from '../../../decorators/require-permissions.decorator'
import {
  CreateAiProviderDto,
  UpdateAiProviderDto,
  UpsertAiProviderModelDto,
  UpsertAiProviderModelsDto,
} from '../ai.dto'
import { AiProviderModelsService } from './provider-models.service'
import { AiProvidersService } from './providers.service'

@Controller('system-admin/ai')
export class AiSystemAdminController {
  constructor(
    private readonly providersService: AiProvidersService,
    private readonly providerModelsService: AiProviderModelsService,
  ) {}

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_READ)
  @Get('providers')
  getProviders(): Promise<AiProvider[]> {
    return this.providersService.getSystemProviders()
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Post('providers')
  createProvider(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: CreateAiProviderDto,
  ): Promise<AiProvider> {
    return this.providersService.createSystemProvider(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Patch('providers/:providerId')
  updateProvider(
    @CurrentUser() authUser: AuthUserContext,
    @Param('providerId') providerId: string,
    @Body() payload: UpdateAiProviderDto,
  ): Promise<AiProvider> {
    return this.providersService.updateSystemProvider(authUser.id, providerId, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Get('providers/:providerId/credential')
  getProviderCredential(@Param('providerId') providerId: string): Promise<AiProviderCredential> {
    return this.providersService.getSystemProviderCredential(providerId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Delete('providers/:providerId')
  async deleteProvider(@Param('providerId') providerId: string): Promise<void> {
    await this.providersService.deleteSystemProvider(providerId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_READ)
  @Get('providers/:providerId/models')
  getModels(@Param('providerId') providerId: string): Promise<AiProviderModels> {
    return this.providerModelsService.getSystemModels(providerId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Post('providers/:providerId/models/discover')
  discoverModels(@Param('providerId') providerId: string): Promise<AiProviderModels> {
    return this.providerModelsService.discoverSystemProviderModels(providerId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Post('providers/:providerId/models')
  upsertModel(
    @Param('providerId') providerId: string,
    @Body() payload: UpsertAiProviderModelDto,
  ): Promise<AiProviderModelItem> {
    return this.providerModelsService.upsertSystemModel(providerId, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Put('providers/:providerId/models')
  upsertModels(
    @Param('providerId') providerId: string,
    @Body() payload: UpsertAiProviderModelsDto,
  ): Promise<AiProviderModels> {
    return this.providerModelsService.upsertSystemModels(providerId, payload)
  }
}
