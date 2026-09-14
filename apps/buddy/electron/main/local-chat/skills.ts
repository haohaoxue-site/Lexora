import type { LocalChatIpcContext } from './registrar'
import { dialog, shell } from 'electron'
import { z } from 'zod'
import { skillsRequestSchemas, skillsRpc } from '../../../shared/skills/skillApi'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerSkillsIpc({ handle, request, options }: LocalChatIpcContext) {
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsList, (_event, input) => request(skillsRpc.list, skillsRequestSchemas.skillScope.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsGet, (_event, input) => request(skillsRpc.get, skillsRequestSchemas.target.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsListFiles, (_event, input) => request(skillsRpc.listFiles, skillsRequestSchemas.directory.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsReadFile, (_event, input) => request(skillsRpc.readFile, skillsRequestSchemas.file.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsRevealFile, async (_event, input) => {
    const result = await request(skillsRpc.locateFile, skillsRequestSchemas.file.parse(input))
    shell.showItemInFolder(result.path)
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsPreview, (_event, input) => request(skillsRpc.preview, skillsRequestSchemas.preview.parse(input), 120_000))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsPreviewLocal, async (_event, input) => {
    const parsed = skillsRequestSchemas.skillScope.extend({ updateId: z.string().optional() }).parse(input)
    const window = options.getWindow()
    if (!window)
      return null
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0])
      return null
    return request(skillsRpc.preview, { spaceId: parsed.spaceId, updateId: parsed.updateId, source: { kind: 'directory', location: result.filePaths[0] } }, 120_000)
  })
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsInstall, (_event, input) => request(skillsRpc.install, skillsRequestSchemas.install.parse(input), 120_000))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsDiscard, (_event, input) => request(skillsRpc.discard, skillsRequestSchemas.discard.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsSetEnabled, (_event, input) => request(skillsRpc.setEnabled, skillsRequestSchemas.setEnabled.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsRemove, (_event, input) => request(skillsRpc.remove, skillsRequestSchemas.remove.parse(input)))
  handle(LOCAL_CHAT_IPC_CHANNELS.skillsReveal, async (_event, input) => {
    const result = await request(skillsRpc.get, skillsRequestSchemas.target.parse(input))
    shell.showItemInFolder(result.skill.filePath)
  })
}
