import process from 'node:process'

export function writeError(message = '') {
  process.stderr.write(`${message}\n`)
}

export function writeOutput(message = '') {
  process.stdout.write(`${message}\n`)
}
