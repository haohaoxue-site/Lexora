import type { AiModelItem, AiModelServiceConfigSummary, AiModelSyncResult } from '@haohaoxue/samepage-contracts'
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
} from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { RequirePermissions } from '../../../decorators/require-permissions.decorator'
import {
  CreateAiModelItemDto,
  CreateAiModelServiceDto,
  UpdateAiModelItemDto,
  UpdateAiModelServiceDto,
} from '../ai.dto'
import { AiModelItemsService } from './items.service'
import { AiModelServicesService } from './services.service'

@Controller('system-admin/ai')
export class AiSystemAdminController {
  constructor(
    private readonly modelServicesService: AiModelServicesService,
    private readonly modelItemsService: AiModelItemsService,
  ) {}

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_READ)
  @Get('model-services')
  getModelServices(): Promise<AiModelServiceConfigSummary[]> {
    return this.modelServicesService.getSystemServices()
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Post('model-services')
  createModelService(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: CreateAiModelServiceDto,
  ): Promise<AiModelServiceConfigSummary> {
    return this.modelServicesService.createSystemService(authUser.id, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Patch('model-services/:configId')
  updateModelService(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
    @Body() payload: UpdateAiModelServiceDto,
  ): Promise<AiModelServiceConfigSummary> {
    return this.modelServicesService.updateSystemService(authUser.id, configId, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Delete('model-services/:configId')
  async deleteModelService(@Param('configId') configId: string): Promise<void> {
    await this.modelServicesService.deleteSystemService(configId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_READ)
  @Get('model-services/:configId/models')
  getModels(@Param('configId') configId: string): Promise<AiModelItem[]> {
    return this.modelItemsService.getSystemModels(configId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Post('model-services/:configId/models/sync')
  syncModels(@Param('configId') configId: string): Promise<AiModelSyncResult> {
    return this.modelItemsService.syncSystemProviderModels(configId)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Post('model-services/:configId/models')
  createModel(
    @Param('configId') configId: string,
    @Body() payload: CreateAiModelItemDto,
  ): Promise<AiModelItem> {
    return this.modelItemsService.createSystemModel(configId, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Patch('model-services/:configId/models/:modelItemId')
  updateModel(
    @Param('configId') configId: string,
    @Param('modelItemId') modelItemId: string,
    @Body() payload: UpdateAiModelItemDto,
  ): Promise<AiModelItem> {
    return this.modelItemsService.updateSystemModel(configId, modelItemId, payload)
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_ADMIN_AI_CONFIG_UPDATE)
  @Delete('model-services/:configId/models/:modelItemId')
  async deleteModel(
    @Param('configId') configId: string,
    @Param('modelItemId') modelItemId: string,
  ): Promise<void> {
    await this.modelItemsService.deleteSystemModel(configId, modelItemId)
  }
}
