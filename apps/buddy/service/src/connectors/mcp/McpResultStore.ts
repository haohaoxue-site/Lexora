import type { ArtifactService } from '../../artifacts/ArtifactService'
import type { DirectoryGrant } from '../../directories/resolveGrantedPath'
import type { McpResultWriter } from './mcpToolResults'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveGrantedPath } from '../../directories/resolveGrantedPath'

const EXTENSIONS: Readonly<Record<string, string>> = {
  'text/plain': 'txt',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
}

export function createMcpResultWriter(options: {
  artifactService: Pick<ArtifactService, 'presentOutputs'>
  conversationId: string
  cwd: string
  grants: readonly DirectoryGrant[]
}): McpResultWriter {
  return async (bytes, mimeType, signal) => {
    signal?.throwIfAborted()
    const directory = await resolveGrantedPath(options.grants, join(options.cwd, 'mcp-results'), 'create')
    await mkdir(directory.canonicalPath, { recursive: true, mode: 0o700 })
    const location = await resolveGrantedPath(options.grants, join(directory.canonicalPath, `${randomUUID()}.${EXTENSIONS[mimeType] ?? 'bin'}`), 'create')
    await writeFile(location.canonicalPath, bytes, { flag: 'wx', mode: 0o600, signal })
    try {
      signal?.throwIfAborted()
      const [artifact] = await options.artifactService.presentOutputs({ ...options, paths: [location.canonicalPath] })
      if (!artifact)
        throw new Error('MCP result registration failed')
      return { artifactId: artifact.id, path: location.canonicalPath }
    }
    catch (error) {
      await unlink(location.canonicalPath)
      throw error
    }
  }
}
