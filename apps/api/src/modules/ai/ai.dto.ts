import type {
  AiModelAuthMode,
  AiModelCapability,
  AiModelType,
  UpdateAiDefaultModelPolicyRequest,
} from '@haohaoxue/samepage-contracts'
import {
  AI_MODEL_AUTH_MODE_VALUES,
  AI_MODEL_CAPABILITY_VALUES,
  AI_MODEL_TYPE_VALUES,
} from '@haohaoxue/samepage-contracts'
import { Transform } from 'class-transformer'
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
} from 'class-validator'

export class CreateAiModelServiceDto {
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

export class UpdateAiModelServiceDto {
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

export class CreateAiModelItemDto {
  @IsString()
  @MaxLength(160)
  modelId!: string

  @IsString()
  @MaxLength(160)
  modelName!: string

  @IsEnum(AI_MODEL_TYPE_VALUES)
  modelType!: AiModelType

  @IsArray()
  @IsEnum(AI_MODEL_CAPABILITY_VALUES, { each: true })
  capabilities!: AiModelCapability[]

  @IsOptional()
  @IsInt()
  @Min(1)
  contextWindow?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number
}

export class UpdateAiModelItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  modelName?: string

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

export class UpdateDefaultModelDto implements UpdateAiDefaultModelPolicyRequest {
  @IsString()
  @MaxLength(80)
  configId!: string

  @IsString()
  @MaxLength(160)
  modelId!: string
}

export class TestAiProviderCredentialDto {
  @IsOptional()
  @IsEnum(AI_MODEL_AUTH_MODE_VALUES)
  authMode?: AiModelAuthMode
}
