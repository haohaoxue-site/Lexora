import type { FileHandle } from 'node:fs/promises'
import type { ApplicationLogAnchor, ApplicationLogLaunch, ApplicationLogPage, ApplicationLogQuery, ApplicationLogRecord } from '../../../shared/diagnostics/applicationLog'
import { Buffer } from 'node:buffer'
import { lstat, open, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { APPLICATION_LOG_MAX_FILE_BYTES, APPLICATION_LOG_MAX_FILES, applicationLogCategory, applicationLogKey, applicationLogQuerySchema, applicationLogRecordSchema } from '../../../shared/diagnostics/applicationLog'
import { MAX_DIAGNOSTIC_RECORD_BYTES, redactDiagnosticText } from './diagnosticRecord'

interface LogFile {
  identity: string
  handle: FileHandle
  size: number
  signature: string
}

interface RecordLocation extends ApplicationLogAnchor {
  fileId: string
  offset: number
  length: number
}

interface FileIndex {
  records: RecordLocation[]
  launch: ApplicationLogLaunch | null
  skippedRecords: number
}

type LogFilters = Pick<Required<ApplicationLogQuery>, 'launch' | 'category' | 'level' | 'search'>

export class ApplicationLogReader {
  #cache: { key: string, files: Map<string, { signature: string, value: Promise<FileIndex> }> } | null = null
  readonly directory: string
  readonly currentLaunchId: string
  readonly userHome: string

  constructor(directory: string, currentLaunchId: string, userHome: string) {
    this.directory = directory
    this.currentLaunchId = currentLaunchId
    this.userHome = userHome
  }

  async query(input: ApplicationLogQuery): Promise<ApplicationLogPage> {
    const query = applicationLogQuerySchema.parse(input)
    const files = await this.#openFiles()
    try {
      const filters: LogFilters = { launch: query.launch, category: query.category, level: query.level, search: query.search.toLocaleLowerCase() }
      const key = JSON.stringify(filters)
      const cache = this.#cache?.key === key ? this.#cache : { key, files: new Map<string, { signature: string, value: Promise<FileIndex> }>() }
      this.#cache = cache
      const fileMap = new Map(files.map(file => [file.identity, file]))
      for (const identity of cache.files.keys()) {
        if (!fileMap.has(identity))
          cache.files.delete(identity)
      }
      const indexes: FileIndex[] = []
      for (const file of files) {
        let entry = cache.files.get(file.identity)
        if (!entry || entry.signature !== file.signature) {
          entry = { signature: file.signature, value: this.#indexFile(file, filters) }
          cache.files.set(file.identity, entry)
          void entry.value.catch(() => {
            if (cache.files.get(file.identity) === entry)
              cache.files.delete(file.identity)
          })
        }
        indexes.push(await entry.value)
      }

      const locations: RecordLocation[] = []
      const launches = new Map<string, ApplicationLogLaunch>()
      const seen = new Set<string>()
      let skippedRecords = 0
      let inspected = 0
      for (const index of indexes) {
        skippedRecords += index.skippedRecords
        const previous = index.launch && launches.get(index.launch.launchId)
        if (index.launch && (!previous || index.launch.firstRecordedAt < previous.firstRecordedAt))
          launches.set(index.launch.launchId, index.launch)
        for (const record of index.records) {
          if (++inspected % 1024 === 0)
            await setImmediate()
          const recordKey = applicationLogKey(record)
          if (seen.has(recordKey))
            continue
          seen.add(recordKey)
          locations.push(record)
        }
      }
      const start = query.anchor ? locations.findIndex(record => applicationLogKey(record) === applicationLogKey(query.anchor!)) : 0
      const anchorExpired = start < 0
      const total = anchorExpired ? 0 : locations.length - start
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)))
      const offset = Math.max(0, start) + (page - 1) * query.pageSize
      const selected = anchorExpired ? [] : locations.slice(offset, offset + query.pageSize)
      const records: ApplicationLogRecord[] = []
      for (const location of selected) {
        const record = this.#parse(await readBytes(fileMap.get(location.fileId)!, location.length, location.offset))
        if (!record || applicationLogKey(record) !== applicationLogKey(location))
          throw new Error('Application log changed during read')
        records.push(record)
      }
      const first = locations[start]
      return {
        records,
        launches: [...launches.values()].sort((a, b) => b.firstRecordedAt.localeCompare(a.firstRecordedAt)),
        currentLaunchId: this.currentLaunchId,
        page,
        pageSize: query.pageSize,
        total,
        anchor: first ? { launchId: first.launchId, sequence: first.sequence } : null,
        anchorExpired,
        skippedRecords,
      }
    }
    finally {
      await Promise.all(files.map(file => file.handle.close()))
    }
  }

  async #openFiles(): Promise<LogFile[]> {
    const files: LogFile[] = []
    try {
      const entries = await readdir(this.directory, { withFileTypes: true }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return []
        throw error
      })
      const names = entries.filter(entry => entry.isFile()).flatMap((entry) => {
        const match = /^application(?:\.([1-9]\d*))?\.jsonl$/.exec(entry.name)
        const index = match ? Number(match[1] ?? 0) : -1
        return index >= 0 && index < APPLICATION_LOG_MAX_FILES ? [{ name: entry.name, index }] : []
      }).sort((a, b) => a.index - b.index)
      const identities = new Set<string>()
      for (const { name } of names) {
        const path = join(this.directory, name)
        let handle: FileHandle | undefined
        try {
          const before = await lstat(path)
          if (!before.isFile())
            continue
          handle = await open(path, 'r')
          const stat = await handle.stat()
          const identity = `${stat.dev}:${stat.ino}`
          if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || identities.has(identity)) {
            await handle.close()
            continue
          }
          identities.add(identity)
          files.push({ handle, identity, size: stat.size, signature: `${identity}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` })
        }
        catch (error) {
          await handle?.close()
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw error
        }
      }
      return files
    }
    catch (error) {
      await Promise.all(files.map(file => file.handle.close()))
      throw error
    }
  }

  async #indexFile(file: LogFile, filters: LogFilters): Promise<FileIndex> {
    const offset = Math.max(0, file.size - APPLICATION_LOG_MAX_FILE_BYTES)
    const index: FileIndex = { records: [], launch: null, skippedRecords: offset ? 1 : 0 }
    const launchId = filters.launch === 'current' ? this.currentLaunchId : filters.launch === 'all' ? null : filters.launch
    const buffer = await readBytes(file, Math.min(file.size, APPLICATION_LOG_MAX_FILE_BYTES), offset)
    let end = buffer.lastIndexOf(10)
    let inspected = 0
    while (end >= 0) {
      const start = end === 0 ? 0 : buffer.lastIndexOf(10, end - 1) + 1
      const line = buffer.subarray(start, end)
      end = start - 1
      if (!line.length || (start === 0 && offset > 0))
        continue
      if (++inspected % 128 === 0)
        await setImmediate()
      const record = this.#parse(line)
      if (!record) {
        index.skippedRecords++
        continue
      }
      if (!index.launch || record.timestamp < index.launch.firstRecordedAt)
        index.launch = { launchId: record.launchId, firstRecordedAt: record.timestamp, appVersion: record.appVersion, platform: record.platform }
      if ((launchId && record.launchId !== launchId)
        || (filters.level !== 'all' && record.level !== filters.level)
        || (filters.category !== 'all' && applicationLogCategory(record) !== filters.category)
        || (filters.search && !JSON.stringify(record).toLocaleLowerCase().includes(filters.search))) {
        continue
      }
      index.records.push({ fileId: file.identity, offset: offset + start, length: line.length, launchId: record.launchId, sequence: record.sequence })
    }
    return index
  }

  #parse(line: Buffer): ApplicationLogRecord | null {
    if (line.length > MAX_DIAGNOSTIC_RECORD_BYTES)
      return null
    try {
      const parsed = applicationLogRecordSchema.safeParse(JSON.parse(line.toString('utf8')))
      if (!parsed.success)
        return null
      const record = parsed.data
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string')
          Object.assign(record, { [key]: redactDiagnosticText(value, this.userHome) })
      }
      if (record.error) {
        for (const [key, value] of Object.entries(record.error)) {
          if (value !== undefined)
            Object.assign(record.error, { [key]: redactDiagnosticText(value, this.userHome) })
        }
      }
      return record
    }
    catch {
      return null
    }
  }
}

async function readBytes(file: LogFile, length: number, position: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  let total = 0
  while (total < length) {
    const { bytesRead } = await file.handle.read(buffer, total, length - total, position + total)
    if (!bytesRead)
      break
    total += bytesRead
  }
  return buffer.subarray(0, total)
}
