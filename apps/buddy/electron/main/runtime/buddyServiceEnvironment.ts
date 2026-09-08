import process from 'node:process'
import { createChildProcessEnvironment } from '../../../platform/childProcessEnvironment'
import { filePathAdapters } from '../../../platform/filePaths'
import searchTools from '../../../platform/searchTools.json'
import { resolveBuddyPlatform } from '../../../shared/platform'

export function resolveBuddySearchToolsDirectory(options: {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
  platform?: NodeJS.Platform
  architecture?: string
}): string {
  const platform = resolveBuddyPlatform(options.platform ?? process.platform)
  const target = `${platform.id}-${options.architecture ?? process.arch}`
  if (!Object.values(searchTools.tools).every(tool => Object.hasOwn(tool.targets, target)))
    throw new Error(`Unsupported search tools target: ${target}`)
  return filePathAdapters[platform.id].resolveInput(
    options.isPackaged ? searchTools.resource.to : `${searchTools.resource.from}/${target}`,
    options.isPackaged ? options.resourcesPath : options.appPath,
  )
}

export function createBuddyServiceEnvironment(
  source: NodeJS.ProcessEnv,
  buddyHome: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const targetPlatform = resolveBuddyPlatform(platform)
  return createChildProcessEnvironment({
    source,
    platform: targetPlatform,
    additions: {
      LEXORA_BUDDY_HOME: buddyHome,
      NODE_USE_ENV_PROXY: '1',
      PI_CODING_AGENT_DIR: filePathAdapters[targetPlatform.id].resolveInput('agent', buddyHome),
    },
  })
}
