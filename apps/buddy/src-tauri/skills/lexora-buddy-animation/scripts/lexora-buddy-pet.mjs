#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const socketEnvName = 'LEXORA_BUDDY_PET_SOCKET'
const defaultSocketPath = createDefaultSocketPath()
const socketPath = process.env[socketEnvName] || defaultSocketPath
const connectTimeoutMs = 1_500
const launchWaitMs = 5_000
const buddyBinaries = ['lexora-buddy-pet', 'lexora-buddy']

function createDefaultSocketPath() {
  const runtimeDir = process.env.XDG_RUNTIME_DIR
  if (runtimeDir)
    return path.join(runtimeDir, 'lexora-buddy', 'native-pet.sock')

  return path.join(os.tmpdir(), `lexora-buddy-uid-${resolveProcessUidSegment()}`, 'native-pet.sock')
}

function resolveProcessUidSegment() {
  return typeof process.getuid === 'function' ? process.getuid() : 'user'
}

const animationAliases = new Map([
  ['dance', 'celebrate'],
  ['focus', 'working'],
  ['left', 'run_left'],
  ['right', 'run_right'],
])

const animations = new Set([
  'idle',
  'run_left',
  'run_right',
  'sleep',
  'wake',
  'hover',
  'tap',
  'approval',
  'thinking',
  'working',
  'celebrate',
  'sad',
  'reassure',
  'explain',
  'curious',
  'trip_fall_left',
  'fallen_idle_left',
  'fallen_get_up_left',
  'trip_fall_right',
  'fallen_idle_right',
  'fallen_get_up_right',
  'stumble_recover_left',
  'stumble_recover_right',
])

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  try {
    switch (command) {
      case 'diagnose':
        printJson(await diagnose())
        return
      case 'socket-path':
        process.stdout.write(`${socketPath}\n`)
        return
      case 'active-window':
        printJson(detectActiveWindow())
        return
      case 'sidecars':
        printJson({ ok: true, sidecars: detectNativePetSidecars() })
        return
      case 'launch':
        printJson(await launchBuddyPet())
        return
      case 'state':
        printJson(await readPetState())
        return
      case 'capabilities':
        printJson(await sendControlRequest({ type: 'capabilities' }))
        return
      case 'animation':
        await sendAnimation(requiredArg(rest, 'animation name'))
        return
      case 'dance':
        await sendAnimation('celebrate')
        return
      case 'move':
        await sendMoveCommand(rest)
        return
      case 'perform':
        await performPreset(requiredArg(rest, 'preset name'), parseOptions(rest.slice(1)))
        return
      case 'sequence':
        await runSequenceCommand(parseOptions(rest))
        return
      case 'walk-left':
      case 'walk-window-left':
        await sendWindowWalk('left', parseOptions(rest))
        return
      case 'walk-right':
      case 'walk-window-right':
        await sendWindowWalk('right', parseOptions(rest))
        return
      case 'walk-up':
      case 'walk-window-up':
        await sendWindowWalk('top', parseOptions(rest))
        return
      case 'walk-down':
      case 'walk-window-down':
        await sendWindowWalk('bottom', parseOptions(rest))
        return
      case 'walk-to-edge':
        await sendWalkToEdge(requiredArg(rest, 'edge'), parseOptions(rest.slice(1)))
        return
      case 'walk-to-x':
        await sendWalkToX(readRequiredNumberOption(parseOptions(rest), 'x'), parseOptions(rest))
        return
      case 'walk-to':
        await sendWalkToPosition(parseOptions(rest))
        return
      case 'help':
      case undefined:
        printHelp()
        return
      default:
        throw new Error(`unknown command: ${command}`)
    }
  }
  catch (error) {
    printJson({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      socketPath,
    })
    process.exitCode = 1
  }
}

async function sendAnimation(name) {
  const { animation } = await sendAnimationRequest(name)
  printJson({ ok: true, command: 'animation', animation, socketPath })
}

async function sendAnimationRequest(name) {
  const animation = normalizeAnimation(name)
  await sendControlRequest({ type: 'animation', animation })
  return { animation }
}

async function sendWindowWalk(edge, options) {
  const after = readOptionalAnimation(options.after)
  const activeWindow = detectActiveWindow()
  if ((edge === 'left' || edge === 'right') && activeWindow.ok && Number.isFinite(activeWindow.x)) {
    const x = edge === 'left' ? activeWindow.x : activeWindow.x + activeWindow.width
    await sendMoveTarget({ kind: 'x', x: Math.round(x) }, after)
    printJson({ ok: true, command: `walk-window-${edge}`, target: 'active-window', activeWindow, after, socketPath })
    return
  }

  await sendWalkToEdge(edge, options, activeWindow)
}

async function sendWalkToEdge(edge, options, activeWindow = detectActiveWindow()) {
  edge = normalizeEdge(edge)

  const after = readOptionalAnimation(options.after)
  await sendMoveTarget({ kind: 'edge', edge }, after)
  printJson({ ok: true, command: `walk-${edge}`, target: 'screen-edge', activeWindow, after, socketPath })
}

async function sendWalkToX(x, options) {
  const after = readOptionalAnimation(options.after)
  await sendMoveTarget({ kind: 'x', x: Math.round(x) }, after)
  printJson({ ok: true, command: 'walk-to-x', x: Math.round(x), after, socketPath })
}

async function sendWalkToPosition(options) {
  const x = readRequiredNumberOption(options, 'x')
  const y = readRequiredNumberOption(options, 'y')
  const after = readOptionalAnimation(options.after)
  await sendMoveTarget({ kind: 'position', x: Math.round(x), y: Math.round(y) }, after)
  printJson({ ok: true, command: 'walk-to', x: Math.round(x), y: Math.round(y), after, socketPath })
}

async function sendMoveCommand(args) {
  const target = requiredArg(args, 'move target')
  const options = parseOptions(args.slice(1))
  const after = readOptionalAnimation(options.after)
  switch (target) {
    case 'center':
      await sendMoveTarget({ kind: 'center' }, after)
      printJson({ ok: true, command: 'move', target: 'center', after, socketPath })
      return
    case 'home':
      await sendMoveTarget({ kind: 'home' }, after)
      printJson({ ok: true, command: 'move', target: 'home', after, socketPath })
      return
    case 'edge': {
      const edge = normalizeEdge(requiredArg(args.slice(1), 'edge'))
      await sendMoveTarget({ kind: 'edge', edge }, after)
      printJson({ ok: true, command: 'move', target: 'edge', edge, after, socketPath })
      return
    }
    case 'position': {
      const x = readRequiredNumberOption(options, 'x')
      const y = readRequiredNumberOption(options, 'y')
      await sendMoveTarget({ kind: 'position', x: Math.round(x), y: Math.round(y) }, after)
      printJson({ ok: true, command: 'move', target: 'position', x: Math.round(x), y: Math.round(y), after, socketPath })
      return
    }
    default:
      throw new Error(`unknown move target: ${target}`)
  }
}

async function sendMoveTarget(target, after) {
  const request = { type: 'move', target }
  if (after)
    request.after = after
  return sendControlRequest(request)
}

async function performPreset(preset, options) {
  switch (preset) {
    case 'center-cast-return-sleep':
      await performCenterCastReturnSleep(options)
      return
    default:
      throw new Error(`unknown preset: ${preset}`)
  }
}

async function runSequenceCommand(options) {
  const sequence = readSequenceSpec(options)
  const result = await executeSequence(sequence)
  printJson({
    ok: true,
    command: 'sequence',
    steps: result.steps,
    snapshots: Object.fromEntries(result.snapshots),
    socketPath,
  })
}

function readSequenceSpec(options) {
  if (options.json)
    return JSON.parse(options.json)
  if (options.file)
    return JSON.parse(fs.readFileSync(options.file, 'utf8'))
  throw new Error('missing --json or --file for sequence')
}

async function executeSequence(sequence) {
  const steps = Array.isArray(sequence?.steps) ? sequence.steps : sequence
  if (!Array.isArray(steps))
    throw new Error('sequence must be an array or an object with steps')

  const snapshots = new Map()
  for (const step of steps) {
    await executeSequenceStep(step, snapshots)
  }

  return { steps: steps.length, snapshots }
}

async function executeSequenceStep(step, snapshots) {
  switch (step?.type) {
    case 'snapshot': {
      const name = step.name || 'original'
      const state = await readPetState()
      assertPetState(state)
      snapshots.set(name, state.position)
      return
    }
    case 'move': {
      const target = resolveSequenceMoveTarget(step.target, snapshots)
      const after = readOptionalAnimation(step.after)
      await sendMoveTarget(target, after)
      if (step.wait !== false)
        await waitForMotionIdle(`move:${target.kind}`, readDurationMs(step.timeoutMs, 10_000))
      return
    }
    case 'animation': {
      await sendAnimationRequest(step.animation)
      if (step.durationMs !== undefined)
        await delay(readDurationMs(step.durationMs, 0))
      return
    }
    case 'wait': {
      if (step.motionIdle)
        await waitForMotionIdle('wait', readDurationMs(step.timeoutMs, 10_000))
      else
        await delay(readDurationMs(step.durationMs, 0))
      return
    }
    default:
      throw new Error(`unknown sequence step type: ${step?.type}`)
  }
}

function resolveSequenceMoveTarget(target, snapshots) {
  if (typeof target === 'string') {
    if (target === 'center' || target === 'home')
      return { kind: target }
    throw new Error(`unsupported sequence move target: ${target}`)
  }

  switch (target?.kind) {
    case 'center':
    case 'home':
      return { kind: target.kind }
    case 'edge':
      return { kind: 'edge', edge: normalizeEdge(target.edge) }
    case 'position': {
      const x = Number(target.x)
      const y = Number(target.y)
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error('sequence position target requires numeric x/y')
      return { kind: 'position', x: Math.round(x), y: Math.round(y) }
    }
    case 'snapshot': {
      const name = target.name || 'original'
      const position = snapshots.get(name)
      if (!position)
        throw new Error(`unknown sequence snapshot: ${name}`)
      return { kind: 'position', x: position.x, y: position.y }
    }
    default:
      throw new Error(`unsupported sequence move target: ${JSON.stringify(target)}`)
  }
}

async function performCenterCastReturnSleep(options) {
  const animation = normalizeAnimation(options.animation || options.cast || 'celebrate')
  const durationMs = readDurationMs(options['duration-ms'], 2_000)
  const waitTimeoutMs = readDurationMs(options['wait-timeout-ms'], 10_000)
  const original = await readPetState()
  assertPetState(original)

  await sendMoveTarget({ kind: 'center' })
  await waitForMotionIdle('center', waitTimeoutMs)
  await sendAnimationRequest(animation)
  await delay(durationMs)
  await sendMoveTarget({
    kind: 'position',
    x: original.position.x,
    y: original.position.y,
  }, 'sleep')
  await waitForMotionIdle('original', waitTimeoutMs)

  printJson({
    ok: true,
    command: 'perform',
    preset: 'center-cast-return-sleep',
    original: original.position,
    animation,
    durationMs,
    socketPath,
  })
}

async function readPetState() {
  return sendControlRequest({ type: 'state' })
}

function assertPetState(state) {
  if (!state?.ok)
    throw new Error(state?.error || 'Lexora Buddy pet did not return state')
  if (!Number.isFinite(state.position?.x) || !Number.isFinite(state.position?.y))
    throw new Error('Lexora Buddy pet state is missing position')
}

async function waitForMotionIdle(label, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const state = await readPetState()
    assertPetState(state)
    if (!state.motion?.active)
      return state
    await delay(120)
  }

  throw new Error(`timed out waiting for Lexora Buddy pet motion to finish: ${label}`)
}

function readDurationMs(value, fallback) {
  if (value === undefined)
    return fallback
  const durationMs = Number(value)
  if (!Number.isFinite(durationMs) || durationMs < 0)
    throw new Error(`invalid duration: ${value}`)
  return Math.round(durationMs)
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sendControlRequest(request) {
  return sendControlMessage(JSON.stringify(request))
}

function normalizeAnimation(name) {
  const normalized = String(name || '').trim().toLowerCase().replaceAll('-', '_')
  const animation = animationAliases.get(normalized) || normalized
  if (!animations.has(animation))
    throw new Error(`unknown animation: ${name}`)
  return animation
}

function readOptionalAnimation(value) {
  if (value === undefined)
    return undefined
  return normalizeAnimation(value)
}

function normalizeEdge(value) {
  const edge = String(value || '').trim().toLowerCase()
  switch (edge) {
    case 'left':
    case 'right':
    case 'top':
    case 'bottom':
      return edge
    case 'up':
      return 'top'
    case 'down':
      return 'bottom'
    default:
      throw new Error(`unsupported edge: ${value}`)
  }
}

function sendControlMessage(message) {
  return new Promise((resolve, reject) => {
    let response = ''
    const client = net.createConnection({ path: socketPath })
    const timer = setTimeout(() => {
      client.destroy()
      reject(new Error(`timed out connecting to Lexora Buddy pet socket: ${socketPath}`))
    }, connectTimeoutMs)

    client.on('connect', () => {
      client.end(`${message}\n`)
    })
    client.on('data', (chunk) => {
      response += chunk.toString('utf8')
    })
    client.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`cannot control Lexora Buddy pet: ${error.message}`))
    })
    client.on('end', () => {
      clearTimeout(timer)
      const line = response.trim().split('\n').find(Boolean)
      if (!line) {
        reject(new Error('Lexora Buddy pet socket closed without acknowledgement'))
        return
      }
      const value = JSON.parse(line)
      if (!value.ok) {
        reject(new Error(value.error || 'Lexora Buddy pet rejected the control message'))
        return
      }
      resolve(value)
    })
  })
}

async function diagnose() {
  const activeWindow = detectActiveWindow()
  const binaries = detectBuddyBinaries()
  const sidecars = detectNativePetSidecars()
  return {
    ok: true,
    platform: process.platform,
    desktop: {
      xdgCurrentDesktop: process.env.XDG_CURRENT_DESKTOP || null,
      xdgSessionDesktop: process.env.XDG_SESSION_DESKTOP || null,
      waylandDisplay: process.env.WAYLAND_DISPLAY || null,
      display: process.env.DISPLAY || null,
    },
    commands: {
      qdbus6: commandPath('qdbus6'),
      gdbus: commandPath('gdbus'),
      kdotool: commandPath('kdotool'),
      xdotool: commandPath('xdotool'),
    },
    installation: {
      packageNames: {
        deb: 'lexora-buddy',
        pacman: 'lexora-buddy-bin',
      },
      binaries,
      launchable: binaries.some(binary => Boolean(binary.path)),
    },
    socket: {
      env: socketEnvName,
      path: socketPath,
      exists: fs.existsSync(socketPath),
      connectable: await canConnectSocket(socketPath),
    },
    runtime: {
      sidecarCount: sidecars.length,
      sidecars,
    },
    activeWindow,
  }
}

async function launchBuddyPet() {
  if (await canConnectSocket(socketPath)) {
    const sidecars = detectNativePetSidecars()
    return {
      ok: true,
      reused: true,
      pid: sidecars[0]?.pid ?? null,
      sidecarCount: sidecars.length,
      socketPath,
      message: 'Lexora Buddy pet is already running',
    }
  }

  const existingSidecars = detectNativePetSidecars()
  if (existingSidecars.length > 0) {
    const connected = await waitForSocket(socketPath, launchWaitMs)
    if (connected) {
      return {
        ok: true,
        reused: true,
        pid: existingSidecars[0].pid,
        sidecarCount: existingSidecars.length,
        socketPath,
        message: 'Lexora Buddy pet sidecar is already running',
      }
    }

    throw new Error(`Lexora Buddy pet sidecar is already running without a connectable control socket (${formatSidecarPids(existingSidecars)}). Close stale native-pet sidecars before launching another one.`)
  }

  const binary = detectBuddyBinaries().find(candidate => candidate.path)
  if (!binary)
    throw new Error('lexora-buddy is not installed or not in PATH')

  const child = spawn(binary.name, [], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const connected = await waitForSocket(socketPath, launchWaitMs)
  return {
    ok: connected,
    binary: binary.name,
    pid: child.pid,
    socketPath,
    message: connected
      ? 'Lexora Buddy pet is ready'
      : 'Lexora Buddy was launched, but the pet socket is not ready yet',
  }
}

function detectBuddyBinaries() {
  return buddyBinaries.map(name => ({
    name,
    path: commandPath(name),
  }))
}

function detectNativePetSidecars() {
  if (process.platform === 'win32')
    return []

  let output = ''
  try {
    output = execFileSync('ps', ['-eo', 'pid=,ppid=,stat=,command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  }
  catch {
    return []
  }

  return output
    .split('\n')
    .map(line => parseProcessLine(line))
    .filter(Boolean)
    .filter(processInfo => processInfo.command.includes('lexora-buddy')
      && processInfo.command.includes('--native-pet'))
}

function parseProcessLine(line) {
  let rest = line
  const pid = readProcessToken(rest)
  if (!pid)
    return null
  rest = pid.rest

  const ppid = readProcessToken(rest)
  if (!ppid)
    return null
  rest = ppid.rest

  const stat = readProcessToken(rest)
  if (!stat)
    return null
  rest = stat.rest

  const command = rest.trim()
  if (!command)
    return null

  return {
    pid: Number(pid.token),
    ppid: Number(ppid.token),
    stat: stat.token,
    command,
  }
}

function readProcessToken(value) {
  let start = 0
  while (start < value.length && isProcessWhitespace(value[start]))
    start += 1

  let end = start
  while (end < value.length && !isProcessWhitespace(value[end]))
    end += 1

  if (end === start)
    return null

  return {
    token: value.slice(start, end),
    rest: value.slice(end),
  }
}

function isProcessWhitespace(value) {
  return value === ' ' || value === '\t'
}

function formatSidecarPids(sidecars) {
  return sidecars.map(sidecar => `pid=${sidecar.pid}`).join(', ')
}

async function waitForSocket(candidatePath, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnectSocket(candidatePath))
      return true
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return false
}

function canConnectSocket(candidatePath) {
  return new Promise((resolve) => {
    const client = net.createConnection({ path: candidatePath })
    const timer = setTimeout(() => {
      client.destroy()
      resolve(false)
    }, 500)
    client.on('connect', () => {
      clearTimeout(timer)
      client.end()
      resolve(true)
    })
    client.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

function detectActiveWindow() {
  if (commandPath('xdotool')) {
    try {
      const output = execFileSync('sh', ['-lc', 'xdotool getactivewindow getwindowgeometry --shell'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const values = Object.fromEntries(
        output
          .trim()
          .split('\n')
          .map(line => line.split('='))
          .filter(parts => parts.length === 2),
      )
      return {
        ok: true,
        source: 'xdotool',
        x: Number(values.X),
        y: Number(values.Y),
        width: Number(values.WIDTH),
        height: Number(values.HEIGHT),
      }
    }
    catch (error) {
      return unavailableWindow(`xdotool failed: ${error.message}`)
    }
  }

  if (commandPath('qdbus6') && isKdeDesktop()) {
    return unavailableWindow('KDE Wayland does not expose active window geometry through a safe non-interactive qdbus6 call')
  }

  return unavailableWindow('no supported active window detector found')
}

function unavailableWindow(reason) {
  return { ok: false, source: null, reason }
}

function isKdeDesktop() {
  return [
    process.env.XDG_CURRENT_DESKTOP,
    process.env.XDG_SESSION_DESKTOP,
    process.env.DESKTOP_SESSION,
  ].some(value => String(value || '').toLowerCase().includes('kde')
    || String(value || '').toLowerCase().includes('plasma'))
}

function commandPath(name) {
  try {
    return execFileSync('sh', ['-lc', `command -v ${shellQuote(name)}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null
  }
  catch {
    return null
  }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--'))
      continue
    const key = arg.slice(2)
    const next = args[index + 1]
    if (next === undefined || next.startsWith('--')) {
      options[key] = true
      continue
    }
    options[key] = next
    index += 1
  }
  return options
}

function readRequiredNumberOption(options, name) {
  const value = Number(options[name])
  if (!Number.isFinite(value))
    throw new Error(`missing numeric --${name}`)
  return value
}

function requiredArg(args, label) {
  const value = args.find(arg => !arg.startsWith('--'))
  if (!value)
    throw new Error(`missing ${label}`)
  return value
}

function shellQuote(value) {
  return `'${String(value).replaceAll('\'', '\'\\\'\'')}'`
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2))
}

function printHelp() {
  console.log(`Lexora Buddy pet control

Usage:
  node scripts/lexora-buddy-pet.mjs diagnose
  node scripts/lexora-buddy-pet.mjs state
  node scripts/lexora-buddy-pet.mjs capabilities
  node scripts/lexora-buddy-pet.mjs animation celebrate
  node scripts/lexora-buddy-pet.mjs move center
  node scripts/lexora-buddy-pet.mjs move home --after sleep
  node scripts/lexora-buddy-pet.mjs walk-window-left --after celebrate
  node scripts/lexora-buddy-pet.mjs walk-window-right --after explain
  node scripts/lexora-buddy-pet.mjs walk-to-edge top --after curious
  node scripts/lexora-buddy-pet.mjs walk-to-edge bottom --after celebrate
  node scripts/lexora-buddy-pet.mjs walk-to --x 120 --y 640 --after curious
  node scripts/lexora-buddy-pet.mjs perform center-cast-return-sleep --animation celebrate --duration-ms 2000
  node scripts/lexora-buddy-pet.mjs sequence --json '{"steps":[{"type":"snapshot","name":"original"},{"type":"move","target":"center"},{"type":"animation","animation":"celebrate","durationMs":2000},{"type":"move","target":{"kind":"snapshot","name":"original"},"after":"sleep"}]}'
  node scripts/lexora-buddy-pet.mjs sidecars
`)
}

await main()
