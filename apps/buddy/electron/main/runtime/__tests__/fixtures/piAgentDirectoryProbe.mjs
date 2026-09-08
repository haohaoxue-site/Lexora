import process from 'node:process'

const entry = import.meta.resolve('@earendil-works/pi-coding-agent')
const { getAgentDir, getBinDir } = await import(new URL('./config.js', entry).href)
process.stdout.write(JSON.stringify({ agentDirectory: getAgentDir(), binaryDirectory: getBinDir() }))
