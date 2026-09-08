import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import process from 'node:process'

const [expectedAgentDirectory, workspace] = process.argv.slice(2)
const entry = import.meta.resolve('@earendil-works/pi-coding-agent')
const { getAgentDir, getBinDir } = await import(new URL('./config.js', entry).href)
assert.equal(resolve(getAgentDir()), resolve(expectedAgentDirectory))

let networkAttempts = 0
globalThis.fetch = async () => {
  networkAttempts += 1
  throw new TypeError('synthetic network failure')
}

const { createFindToolDefinition } = await import(new URL('./core/tools/find.js', entry).href)
const { createGrepToolDefinition } = await import(new URL('./core/tools/grep.js', entry).href)
const { createReadToolDefinition } = await import(new URL('./core/tools/read.js', entry).href)
const results = {
  find: await execute(createFindToolDefinition(workspace), { pattern: '*.txt' }),
  grep: await execute(createGrepToolDefinition(workspace), { pattern: '固定夹具' }),
  read: await execute(createReadToolDefinition(workspace), { path: '说明.txt' }),
}
process.stdout.write(JSON.stringify({ binaryDirectory: getBinDir(), networkAttempts, results }))

async function execute(tool, arguments_) {
  try {
    const result = await tool.execute('probe', arguments_)
    return { status: 'ok', text: result.content.filter(item => item.type === 'text').map(item => item.text).join('\n') }
  }
  catch (error) {
    return { status: 'error', error: error.message }
  }
}
