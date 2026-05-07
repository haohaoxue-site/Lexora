import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'
import { describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../../../database/prisma.service'
import { AiDefaultModelsService } from './defaults.service'

describe('aiDefaultModelsService', () => {
  it('查询可选服务模型时，不可用服务返回空列表', async () => {
    const prisma = {
      aiModelServiceConfig: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService
    const service = new AiDefaultModelsService(prisma)

    await expect(service.getAvailableServiceModels(
      'user-1',
      AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      'missing-config',
    )).resolves.toEqual([])
  })
})
