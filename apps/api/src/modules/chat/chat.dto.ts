import type {
  CreateChatSessionMessageRequest,
  EditAndSendChatMessageRequest,
  SwitchChatActiveMessageRequest,
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
  providerId!: string

  @IsString()
  modelId!: string
}

export class CreateChatSessionMessageRequestDto implements CreateChatSessionMessageRequest {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(40_000)
  content!: string
}

export class EditAndSendChatMessageRequestDto implements EditAndSendChatMessageRequest {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(40_000)
  content!: string
}

export class SwitchChatActiveMessageRequestDto implements SwitchChatActiveMessageRequest {
  @IsString()
  @MinLength(1)
  messageId!: string
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
