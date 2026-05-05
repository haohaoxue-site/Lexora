import type {
  AiAvailableModelOption,
  AiAvailableModelServiceOption,
  AiDefaultModelPolicyItem,
  AiModelItem,
  AiModelServiceConfigSummary,
  AiModelSyncResult,
} from '@haohaoxue/samepage-contracts'
import type { AuthUserContext } from '../../auth/auth.interface'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import {
  CreateAiModelItemDto,
  CreateAiModelServiceDto,
  UpdateAiModelItemDto,
  UpdateAiModelServiceDto,
  UpdateDefaultModelDto,
} from '../ai.dto'
import { AiDefaultModelsService } from './defaults.service'
import { AiModelItemsService } from './items.service'
import { AiModelServicesService } from './services.service'

@Controller('users/me/ai')
export class AiUserController {
  constructor(
    private readonly modelServicesService: AiModelServicesService,
    private readonly modelItemsService: AiModelItemsService,
    private readonly defaultModelsService: AiDefaultModelsService,
  ) {}

  @Get('model-services')
  getModelServices(@CurrentUser() authUser: AuthUserContext): Promise<AiModelServiceConfigSummary[]> {
    return this.modelServicesService.getUserServices(authUser.id)
  }

  @Post('model-services')
  createModelService(
    @CurrentUser() authUser: AuthUserContext,
    @Body() payload: CreateAiModelServiceDto,
  ): Promise<AiModelServiceConfigSummary> {
    return this.modelServicesService.createUserService(authUser.id, payload)
  }

  @Patch('model-services/:configId')
  updateModelService(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
    @Body() payload: UpdateAiModelServiceDto,
  ): Promise<AiModelServiceConfigSummary> {
    return this.modelServicesService.updateUserService(authUser.id, configId, payload)
  }

  @Delete('model-services/:configId')
  async deleteModelService(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
  ): Promise<void> {
    await this.modelServicesService.deleteUserService(authUser.id, configId)
  }

  @Get('model-services/:configId/models')
  getModels(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
  ): Promise<AiModelItem[]> {
    return this.modelItemsService.getUserModels(authUser.id, configId)
  }

  @Post('model-services/:configId/models/sync')
  syncModels(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
  ): Promise<AiModelSyncResult> {
    return this.modelItemsService.syncUserProviderModels(authUser.id, configId)
  }

  @Post('model-services/:configId/models')
  createModel(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
    @Body() payload: CreateAiModelItemDto,
  ): Promise<AiModelItem> {
    return this.modelItemsService.createUserModel(authUser.id, configId, payload)
  }

  @Patch('model-services/:configId/models/:modelItemId')
  updateModel(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
    @Param('modelItemId') modelItemId: string,
    @Body() payload: UpdateAiModelItemDto,
  ): Promise<AiModelItem> {
    return this.modelItemsService.updateUserModel(authUser.id, configId, modelItemId, payload)
  }

  @Delete('model-services/:configId/models/:modelItemId')
  async deleteModel(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
    @Param('modelItemId') modelItemId: string,
  ): Promise<void> {
    await this.modelItemsService.deleteUserModel(authUser.id, configId, modelItemId)
  }

  @Get('models/available')
  getAvailableModels(
    @CurrentUser() authUser: AuthUserContext,
    @Query('intentKey') intentKey: string,
  ): Promise<AiAvailableModelOption[]> {
    return this.defaultModelsService.getAvailableModels(authUser.id, intentKey as never)
  }

  @Get('models/available/services')
  getAvailableModelServices(
    @CurrentUser() authUser: AuthUserContext,
    @Query('intentKey') intentKey: string,
    @Query('scope') scope: string,
  ): Promise<AiAvailableModelServiceOption[]> {
    return this.defaultModelsService.getAvailableModelServices(authUser.id, intentKey as never, scope as never)
  }

  @Get('models/available/services/:configId/models')
  getAvailableServiceModels(
    @CurrentUser() authUser: AuthUserContext,
    @Param('configId') configId: string,
    @Query('intentKey') intentKey: string,
  ): Promise<AiAvailableModelOption[]> {
    return this.defaultModelsService.getAvailableServiceModels(authUser.id, intentKey as never, configId)
  }

  @Get('default-models')
  getDefaultModels(@CurrentUser() authUser: AuthUserContext): Promise<AiDefaultModelPolicyItem[]> {
    return this.defaultModelsService.getDefaultModels(authUser.id)
  }

  @Put('default-models/:intentKey')
  updateDefaultModel(
    @CurrentUser() authUser: AuthUserContext,
    @Param('intentKey') intentKey: string,
    @Body() payload: UpdateDefaultModelDto,
  ): Promise<AiDefaultModelPolicyItem> {
    return this.defaultModelsService.updateDefaultModel(authUser.id, intentKey as never, payload)
  }
}
