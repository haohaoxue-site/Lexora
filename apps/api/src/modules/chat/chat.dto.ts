import type { CreateChatCompletionRequest } from '@haohaoxue/samepage-contracts'
import { Type } from 'class-transformer'
import {
  IsOptional,
  IsString,
  MaxLength,
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

  @IsOptional()
  @Type(() => ChatModelRefDto)
  @ValidateNested()
  modelRef?: ChatModelRefDto
}
