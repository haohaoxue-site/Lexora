import type {
  AiModelCapability,
  AiModelType,
  AiProviderAuthMode,
  UpdateAiDefaultModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'
import {
  AI_MODEL_CAPABILITY_VALUES,
  AI_MODEL_TYPE_VALUES,
  AI_PROVIDER_AUTH_MODE_VALUES,
} from '@haohaoxue/samepage-contracts'
import { Transform, Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class CreateAiProviderDto {
  @IsString()
  @MaxLength(80)
  providerKey!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerName?: string

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false }, { message: 'API 地址必须是合法 URL' })
  endpoint?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  apiKey?: string
}

export class UpdateAiProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerName?: string

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false }, { message: 'API 地址必须是合法 URL' })
  endpoint?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  apiKey?: string

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpsertAiProviderModelDto {
  @IsString()
  @MaxLength(160)
  modelId!: string

  @IsString()
  @MaxLength(160)
  modelName!: string

  @IsOptional()
  @IsEnum(AI_MODEL_TYPE_VALUES)
  modelType?: AiModelType

  @IsOptional()
  @IsArray()
  @IsEnum(AI_MODEL_CAPABILITY_VALUES, { each: true })
  capabilities?: AiModelCapability[]

  @IsOptional()
  @IsInt()
  @Min(1)
  contextWindow?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class UpsertAiProviderModelsDto {
  @IsArray()
  @Type(() => UpsertAiProviderModelDto)
  @ValidateNested({ each: true })
  models!: UpsertAiProviderModelDto[]
}

class DefaultModelRefDto {
  @IsString()
  @MaxLength(80)
  providerId!: string

  @IsString()
  @MaxLength(160)
  modelId!: string
}

export class UpdateDefaultModelDto implements UpdateAiDefaultModelPolicyRequest {
  @IsOptional()
  @Type(() => DefaultModelRefDto)
  @ValidateNested()
  modelRef!: DefaultModelRefDto | null
}

export class TestAiProviderCredentialDto {
  @IsOptional()
  @IsEnum(AI_PROVIDER_AUTH_MODE_VALUES)
  authMode?: AiProviderAuthMode
}
