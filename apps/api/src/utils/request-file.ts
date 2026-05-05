import type { MultipartFile } from '@fastify/multipart'
import type { FastifyRequest } from 'fastify'

type MultipartFastifyRequest = FastifyRequest & {
  file: () => Promise<MultipartFile | undefined>
}

export async function getRequestFile(request: FastifyRequest): Promise<MultipartFile | undefined> {
  return await (request as MultipartFastifyRequest).file()
}
