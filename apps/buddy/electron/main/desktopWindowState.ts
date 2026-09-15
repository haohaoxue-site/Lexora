import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

const windowPlacementSchema = z.object({
  height: z.number().int().min(640),
  maximized: z.boolean(),
  width: z.number().int().min(980),
  x: z.number().int(),
  y: z.number().int(),
}).strict()

export type DesktopWindowPlacement = z.infer<typeof windowPlacementSchema>
export type DesktopDisplayBounds = Omit<DesktopWindowPlacement, 'maximized'>

export class DesktopWindowStateStore {
  readonly #path: string | null
  readonly #onError: (operation: 'read' | 'write', error: unknown) => void
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(options: { path: string | null, onError: (operation: 'read' | 'write', error: unknown) => void }) {
    this.#path = options.path
    this.#onError = options.onError
  }

  async read(): Promise<DesktopWindowPlacement | null> {
    if (!this.#path)
      return null
    try {
      return windowPlacementSchema.parse(JSON.parse(await readFile(this.#path, 'utf8')))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof z.ZodError)
        return null
      if (error instanceof SyntaxError)
        return null
      this.#onError('read', error)
      return null
    }
  }

  write(placement: DesktopWindowPlacement): Promise<void> {
    const path = this.#path
    if (!path)
      return Promise.resolve()
    const validated = windowPlacementSchema.parse(placement)
    const operation = this.#writeQueue.then(async () => {
      const parent = dirname(path)
      const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
      await mkdir(parent, { mode: 0o700, recursive: true })
      try {
        const handle = await open(temporaryPath, 'wx', 0o600)
        try {
          await handle.writeFile(`${JSON.stringify(validated)}\n`)
          await handle.sync()
        }
        finally {
          await handle.close()
        }
        await rename(temporaryPath, path)
        await chmod(path, 0o600)
      }
      finally {
        await rm(temporaryPath, { force: true })
      }
    })
    this.#writeQueue = operation.catch((error) => {
      this.#onError('write', error)
    })
    return this.#writeQueue
  }
}

export function resolveVisibleWindowPlacement(
  value: unknown,
  displays: readonly DesktopDisplayBounds[],
): DesktopWindowPlacement | null {
  const placement = windowPlacementSchema.safeParse(value)
  if (!placement.success)
    return null
  const visible = displays.some(display => (
    intersectionSize(
      placement.data.x,
      placement.data.width,
      display.x,
      display.width,
    ) >= 64
    && intersectionSize(
      placement.data.y,
      placement.data.height,
      display.y,
      display.height,
    ) >= 64
  ))
  return visible ? placement.data : null
}

function intersectionSize(start: number, size: number, otherStart: number, otherSize: number) {
  return Math.max(0, Math.min(start + size, otherStart + otherSize) - Math.max(start, otherStart))
}
