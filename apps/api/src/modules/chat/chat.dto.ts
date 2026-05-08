import type {
  CreateChatCompletionRequest,
  UpdateChatSessionModelRequest,
  UpdateChatSessionTitleRequest,
} from '@haohaoxue/samepage-contracts'
import { CHAT_SESSION_TITLE_MAX_LENGTH } from '@haohaoxue/samepage-contracts'
import { Transform, Type } from 'class-transformer'
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

class ChatModelRefDto {
  @IsString()
  configId!: string

  @IsString()
  modelId!: string
}

export class CreateChatCompletionRequestDto implements CreateChatCompletionRequest {
  @IsString()
  sessionId!: string

  @IsString()
  @MaxLength(40_000)
  content!: string
}

export class UpdateChatSessionModelRequestDto implements UpdateChatSessionModelRequest {
  @IsOptional()
  @Type(() => ChatModelRefDto)
  @ValidateNested()
  modelRef!: ChatModelRefDto | null
}

export class UpdateChatSessionTitleRequestDto implements UpdateChatSessionTitleRequest {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_SESSION_TITLE_MAX_LENGTH)
  title!: string
}
