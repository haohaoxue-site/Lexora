import type { BuddyServiceSupervisorState } from './BuddyServiceSupervisor'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'

export type RuntimeDataBackupStatus = 'invalid' | 'unverified' | 'valid'
export type RuntimeDataBackupPurpose = 'manual' | 'pre_restore'
export type RuntimeDataOperationKind = 'backup' | 'restore'
export type RuntimeDataOperationStage
  = 'cleaning_up'
    | 'completed'
    | 'copying_backup'
    | 'copying_restore'
    | 'creating_safety_backup'
    | 'moving_current_data'
    | 'preparing'
    | 'publishing'
    | 'publishing_restored_data'
    | 'verifying_backup'
    | 'verifying_restore'
export type RuntimeDataOperationStatus
  = 'cancelled' | 'cancelling' | 'completed' | 'failed' | 'running'
export type RuntimeDataRecoveryAction
  = 'discarded_incomplete_backup'
    | 'discarded_restore_candidate'
    | 'kept_restored_data'
    | 'restored_previous_data'
export type RuntimeStorageRequirementScope = 'backups' | 'buddy' | 'shared'

export interface RuntimeStorageRequirement {
  availableBytes: number
  requiredBytes: number
  scope: RuntimeStorageRequirementScope
  sufficient: boolean
}

export interface RuntimeDataRestoreCapacity {
  checkedAt: string
  currentDataBytes: number
  requirements: ReadonlyArray<RuntimeStorageRequirement>
  sufficient: boolean
  targetDataBytes: number
}

export interface RuntimeDataBackup {
  createdAt: string | null
  fileCount: number
  id: string
  path: string
  purpose: RuntimeDataBackupPurpose | null
  restoreCapacity: RuntimeDataRestoreCapacity | null
  status: RuntimeDataBackupStatus
  totalBytes: number
}

export interface RuntimeDataBackupStorage {
  availableBytes: number
  backupBytes: number
  backupCount: number
  canCreateBackup: boolean
  checkedAt: string
  createBackupRequiredBytes: number
  currentDataBytes: number
}

export interface RuntimeDataRestore {
  backupId: string
  restoredAt: string
  safetyBackup: RuntimeDataBackup
}

export interface RuntimeDataOperation {
  backupId: string | null
  cancellable: boolean
  completedAt: string | null
  completedBytes: number
  kind: RuntimeDataOperationKind
  operationId: string
  result: RuntimeDataBackup | RuntimeDataRestore | null
  stage: RuntimeDataOperationStage
  startedAt: string
  status: RuntimeDataOperationStatus
  totalBytes: number | null
}

export interface RuntimeDataRecoveryReceipt {
  action: RuntimeDataRecoveryAction
  backupId: string | null
  completedAt: string
  operationId: string | null
}

export interface RuntimeRecoveryServiceOptions {
  backupsDirectory: string
  buddyHome: string
  getStorageAvailableBytes?: (path: string) => Promise<number>
  getRuntimeState: () => BuddyServiceSupervisorState
  openPath: (path: string) => Promise<string>
}

const BACKUP_FORMAT = 'lexora-buddy-data-backup'
const BACKUP_VERSION = 2
const MAX_BACKUP_ENTRIES = 250_000
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024
const MIN_COPY_OVERHEAD_BYTES = 16 * 1024 * 1024
const MIN_POST_OPERATION_FREE_BYTES = 256 * 1024 * 1024
const COPY_OVERHEAD_RATIO = 0.05
const BACKUP_ID_PATTERN = /^buddy-\d{17}-[0-9a-f]{8}$/
const BACKUP_TEMPORARY_ID_PATTERN = /^\.buddy-\d{17}-[0-9a-f]{8}\.tmp$/
const RESTORE_JOURNAL_FORMAT = 'lexora-buddy-restore-journal'
const RESTORE_JOURNAL_VERSION = 1
const RECOVERY_RECEIPT_FORMAT = 'lexora-buddy-data-recovery-receipt'
const RECOVERY_RECEIPT_VERSION = 1
const MAX_RECOVERY_METADATA_BYTES = 16 * 1024
const backupIdSchema = z.string().regex(BACKUP_ID_PATTERN)
const manifestPathSchema = z.string().min(1).max(4_096).refine(isSafeManifestPath)
const manifestEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('directory'),
    mode: z.number().int().min(0).max(0o777),
    path: manifestPathSchema,
  }).strict(),
  z.object({
    kind: z.literal('file'),
    mode: z.number().int().min(0).max(0o777),
    path: manifestPathSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
])
const backupManifestSchema = z.object({
  backupId: backupIdSchema,
  createdAt: z.iso.datetime(),
  entries: z.array(manifestEntrySchema).max(MAX_BACKUP_ENTRIES),
  format: z.literal(BACKUP_FORMAT),
  purpose: z.enum(['manual', 'pre_restore']),
  version: z.literal(BACKUP_VERSION),
}).strict().superRefine((manifest, context) => {
  let previousPath: string | null = null
  for (const [index, entry] of manifest.entries.entries()) {
    if (previousPath !== null && entry.path <= previousPath) {
      context.addIssue({
        code: 'custom',
        message: 'Backup entries must use unique sorted paths',
        path: ['entries', index, 'path'],
      })
    }
    previousPath = entry.path
  }
})

const restoreJournalSchema = z.object({
  backupId: backupIdSchema,
  format: z.literal(RESTORE_JOURNAL_FORMAT),
  operationId: z.uuid().nullable(),
  phase: z.enum([
    'candidate_published',
    'candidate_ready',
    'current_moved',
    'preparing_candidate',
  ]),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.literal(RESTORE_JOURNAL_VERSION),
}).strict()

const dataRecoveryReceiptFileSchema = z.object({
  action: z.enum([
    'discarded_incomplete_backup',
    'discarded_restore_candidate',
    'kept_restored_data',
    'restored_previous_data',
  ]),
  backupId: backupIdSchema.nullable(),
  completedAt: z.iso.datetime(),
  format: z.literal(RECOVERY_RECEIPT_FORMAT),
  operationId: z.uuid().nullable(),
  version: z.literal(RECOVERY_RECEIPT_VERSION),
}).strict()

type BackupManifest = z.infer<typeof backupManifestSchema>
type BackupManifestEntry = z.infer<typeof manifestEntrySchema>
type RestoreJournal = z.infer<typeof restoreJournalSchema>

interface LoadedBackup {
  dataPath: string
  manifest: BackupManifest
  summary: RuntimeDataBackup
}

interface RuntimeDataOperationControl {
  operationId: string
  signal: AbortSignal
}

interface ActiveRuntimeDataOperation {
  controller: AbortController
  value: RuntimeDataOperation
}

class RuntimeDataOperationCancelledError extends Error {
  constructor() {
    super('Runtime data operation was cancelled')
    this.name = 'RuntimeDataOperationCancelledError'
  }
}

export class RuntimeRecoveryService {
  readonly #backupsDirectory: string
  readonly #buddyHome: string
  readonly #getStorageAvailableBytes: NonNullable<RuntimeRecoveryServiceOptions['getStorageAvailableBytes']>
  readonly #getRuntimeState: RuntimeRecoveryServiceOptions['getRuntimeState']
  readonly #openPath: RuntimeRecoveryServiceOptions['openPath']
  readonly #recoveryReceiptPath: string
  readonly #restoreJournalPath: string
  readonly #restoreRollbackPath: string
  readonly #restoreStagingPath: string
  readonly #operationListeners = new Set<(operation: RuntimeDataOperation) => void>()
  readonly #idleWaiters = new Set<() => void>()
  #dataOperation: ActiveRuntimeDataOperation | null = null
  #dataRecoveryReceipt: RuntimeDataRecoveryReceipt | null = null
  #dataMutationInProgress = false
  #isShuttingDown = false
  #reconciliationRequired = false

  constructor(options: RuntimeRecoveryServiceOptions) {
    this.#backupsDirectory = resolve(options.backupsDirectory)
    this.#buddyHome = resolve(options.buddyHome)
    this.#getStorageAvailableBytes = options.getStorageAvailableBytes ?? getStorageAvailableBytes
    this.#getRuntimeState = options.getRuntimeState
    this.#openPath = options.openPath
    this.#recoveryReceiptPath = join(this.#backupsDirectory, '.last-data-recovery.json')
    this.#restoreJournalPath = join(
      dirname(this.#buddyHome),
      `.${basename(this.#buddyHome)}.restore-journal.json`,
    )
    this.#restoreRollbackPath = join(
      dirname(this.#buddyHome),
      `.${basename(this.#buddyHome)}.restore-rollback`,
    )
    this.#restoreStagingPath = join(
      dirname(this.#buddyHome),
      `.${basename(this.#buddyHome)}.restore-staging`,
    )
    if (
      isPathWithin(this.#buddyHome, this.#backupsDirectory)
      || isPathWithin(this.#backupsDirectory, this.#buddyHome)
    ) {
      throw new Error('Runtime backup and Buddy data paths must not overlap')
    }
  }

  get isDataMutationInProgress(): boolean {
    return this.#dataMutationInProgress || this.#reconciliationRequired
  }

  getDataOperation(): RuntimeDataOperation | null {
    return this.#dataOperation?.value ?? null
  }

  getDataRecoveryReceipt(): RuntimeDataRecoveryReceipt | null {
    return this.#dataRecoveryReceipt
  }

  onDataOperationChange(
    listener: (operation: RuntimeDataOperation) => void,
  ): () => void {
    this.#operationListeners.add(listener)
    return () => this.#operationListeners.delete(listener)
  }

  async shutdown(): Promise<void> {
    this.#isShuttingDown = true
    const operation = this.#dataOperation
    if (
      operation?.value.status === 'running'
      && operation.value.cancellable
    ) {
      this.cancelDataOperation(operation.value.operationId)
    }
    if (!this.#dataMutationInProgress)
      return
    await new Promise<void>(resolve => this.#idleWaiters.add(resolve))
  }

  startDataBackup(): RuntimeDataOperation {
    return this.#startDataOperation('backup', null)
  }

  startDataRestore(backupId: string): RuntimeDataOperation {
    backupIdSchema.parse(backupId)
    return this.#startDataOperation('restore', backupId)
  }

  cancelDataOperation(operationId: string): RuntimeDataOperation {
    const operation = this.#dataOperation
    if (!operation || operation.value.operationId !== z.uuid().parse(operationId))
      throw new Error('Runtime data operation does not exist')
    if (!['running', 'cancelling'].includes(operation.value.status))
      return operation.value
    if (!operation.value.cancellable)
      throw new Error('Runtime data operation can no longer be cancelled')
    operation.controller.abort()
    this.#replaceDataOperation({ cancellable: false, status: 'cancelling' })
    return this.#dataOperation!.value
  }

  async reconcileInterruptedDataOperations(): Promise<RuntimeDataRecoveryReceipt | null> {
    try {
      return await this.#runReconciliation(async () => {
        await this.#removeRecoveryMetadataTemporaryFiles()
        const interruptedBackupCount = await this.#prepareBackupsDirectory()
        const restoreRecovery = await this.#reconcileInterruptedRestore()
        const receipt = restoreRecovery ?? (interruptedBackupCount > 0
          ? createDataRecoveryReceipt('discarded_incomplete_backup', null)
          : await this.#readDataRecoveryReceipt())
        if (restoreRecovery || interruptedBackupCount > 0)
          await this.#writeDataRecoveryReceipt(receipt!)
        this.#dataRecoveryReceipt = receipt
        this.#reconciliationRequired = false
        return receipt
      })
    }
    catch (error) {
      this.#reconciliationRequired = true
      throw error
    }
  }

  async reconcileInterruptedRestore(): Promise<void> {
    await this.reconcileInterruptedDataOperations()
  }

  async createDataBackup(): Promise<RuntimeDataBackup> {
    return this.#runDataMutation(() => this.#createManualDataBackup())
  }

  async deleteDataBackup(backupId: string): Promise<{ deletedBackupId: string }> {
    return this.#runDataMutation(async () => {
      this.#assertRuntimeFullyOffline('Runtime data backup deletion')
      backupIdSchema.parse(backupId)
      await this.#prepareBackupsDirectory()
      await this.#assertRealPathsDoNotOverlap()
      const path = this.#backupPath(backupId)
      await assertRealDirectory(path, 'Backup path')
      await assertSafeDeletionTree(path, await getStorageDeviceId(this.#backupsDirectory))
      await rm(path, { recursive: true })
      return { deletedBackupId: backupId }
    })
  }

  async getDataBackupStorage(): Promise<RuntimeDataBackupStorage> {
    this.#assertRuntimeFullyOffline('Inspecting Runtime data backup storage')
    if (this.#dataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    await this.#prepareBackupsDirectory()
    await this.#assertRealPathsDoNotOverlap()
    const [backups, backupUsage, currentUsage, availableBytes] = await Promise.all([
      this.#listPreparedDataBackups(),
      inspectDataUsage(this.#backupsDirectory, 'Runtime backup storage'),
      inspectDataUsage(this.#buddyHome, 'Runtime data'),
      this.#getStorageAvailableBytes(this.#backupsDirectory),
    ])
    const createBackupRequiredBytes = requiredAvailableBytes(currentUsage.totalBytes)
    return {
      availableBytes,
      backupBytes: backupUsage.totalBytes,
      backupCount: backups.length,
      canCreateBackup: availableBytes >= createBackupRequiredBytes,
      checkedAt: new Date().toISOString(),
      createBackupRequiredBytes,
      currentDataBytes: currentUsage.totalBytes,
    }
  }

  async listDataBackups(): Promise<ReadonlyArray<RuntimeDataBackup>> {
    this.#assertRuntimeFullyOffline('Listing Runtime data backups')
    if (this.#dataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    await this.#prepareBackupsDirectory()
    await this.#assertRealPathsDoNotOverlap()
    return this.#listPreparedDataBackups()
  }

  async validateDataBackup(backupId: string): Promise<RuntimeDataBackup> {
    this.#assertRuntimeFullyOffline('Runtime data backup validation')
    if (this.#dataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    backupIdSchema.parse(backupId)
    const summary = await this.#readBackupSummary(backupId)
    if (summary.status === 'invalid')
      return summary
    let backup: LoadedBackup
    try {
      backup = await this.#loadDataBackup(backupId)
      await verifyManifestData(backup.dataPath, backup.manifest)
    }
    catch {
      return { ...summary, status: 'invalid' }
    }
    return {
      ...backup.summary,
      restoreCapacity: await this.#assessRestoreCapacity(backup),
      status: 'valid',
    }
  }

  async restoreDataBackup(backupId: string): Promise<RuntimeDataRestore> {
    return this.#runDataMutation(() => this.#restoreDataBackup(backupId))
  }

  async #createManualDataBackup(
    control?: RuntimeDataOperationControl,
  ): Promise<RuntimeDataBackup> {
    this.#assertRuntimeFullyOffline('Runtime data backup')
    await this.#reconcileInterruptedRestore()
    this.#checkpointDataOperation(control, 'preparing')
    return this.#createDataBackup('manual', control)
  }

  async #restoreDataBackup(
    backupId: string,
    control?: RuntimeDataOperationControl,
  ): Promise<RuntimeDataRestore> {
    this.#assertRuntimeFullyOffline('Runtime data restore')
    backupIdSchema.parse(backupId)
    await this.#reconcileInterruptedRestore()
    this.#checkpointDataOperation(control, 'verifying_backup')

    let backup: LoadedBackup
    try {
      backup = await this.#loadDataBackup(backupId)
      await verifyManifestData(backup.dataPath, backup.manifest, control?.signal)
    }
    catch {
      this.#throwIfDataOperationCancelled(control)
      throw new Error('Runtime data backup verification failed')
    }

    const restoreCapacity = await this.#assessRestoreCapacity(backup)
    if (!restoreCapacity.sufficient)
      throw new Error('Insufficient storage capacity for Runtime data restore')

    this.#checkpointDataOperation(control, 'creating_safety_backup')
    const safetyBackup = await this.#createDataBackup('pre_restore', control)
    const restoreJournal: RestoreJournal = {
      backupId,
      format: RESTORE_JOURNAL_FORMAT,
      operationId: control?.operationId ?? null,
      phase: 'preparing_candidate',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: RESTORE_JOURNAL_VERSION,
    }
    await this.#writeRestoreJournal(restoreJournal)
    this.#checkpointDataOperation(control, 'copying_restore', {
      completedBytes: 0,
      totalBytes: manifestTotalBytes(backup.manifest),
    })
    await rm(this.#restoreStagingPath, { force: true, recursive: true })
    try {
      await copyDataDirectory(backup.dataPath, this.#restoreStagingPath, {
        onProgress: control
          ? completedBytes => this.#replaceDataOperation(
            { completedBytes },
            control.operationId,
          )
          : undefined,
        signal: control?.signal,
      })
      await chmod(this.#restoreStagingPath, 0o700)
    }
    catch (error) {
      try {
        await rm(this.#restoreStagingPath, { force: true, recursive: true })
        await this.#removeRestoreJournal()
      }
      catch {
        this.#reconciliationRequired = true
        throw new Error('Runtime data restore cancellation cleanup failed')
      }
      throw error
    }
    this.#checkpointDataOperation(control, 'verifying_restore', {
      completedBytes: manifestTotalBytes(backup.manifest),
    })
    try {
      await verifyManifestData(this.#restoreStagingPath, backup.manifest, control?.signal)
    }
    catch {
      try {
        await rm(this.#restoreStagingPath, { force: true, recursive: true })
        await this.#removeRestoreJournal()
      }
      catch {
        this.#reconciliationRequired = true
        throw new Error('Runtime data restore verification cleanup failed')
      }
      this.#throwIfDataOperationCancelled(control)
      throw new Error('Runtime data restore staging verification failed')
    }

    await this.#writeRestoreJournal({
      ...restoreJournal,
      phase: 'candidate_ready',
      updatedAt: new Date().toISOString(),
    })
    this.#reconciliationRequired = true
    this.#checkpointDataOperation(control, 'moving_current_data', { cancellable: false })
    await rename(this.#buddyHome, this.#restoreRollbackPath)
    await syncDirectory(dirname(this.#buddyHome))
    await this.#writeRestoreJournal({
      ...restoreJournal,
      phase: 'current_moved',
      updatedAt: new Date().toISOString(),
    })
    this.#checkpointDataOperation(control, 'publishing_restored_data', { cancellable: false })
    try {
      await rename(this.#restoreStagingPath, this.#buddyHome)
      await syncDirectory(dirname(this.#buddyHome))
      await this.#writeRestoreJournal({
        ...restoreJournal,
        phase: 'candidate_published',
        updatedAt: new Date().toISOString(),
      })
    }
    catch (error) {
      try {
        await rename(this.#restoreRollbackPath, this.#buddyHome)
        await rm(this.#restoreStagingPath, { force: true, recursive: true })
        await this.#removeRestoreJournal()
        await syncDirectory(dirname(this.#buddyHome))
        this.#reconciliationRequired = false
      }
      catch {
        this.#reconciliationRequired = true
      }
      throw error
    }

    this.#checkpointDataOperation(control, 'cleaning_up', { cancellable: false })
    try {
      await rm(this.#restoreRollbackPath, { force: true, recursive: true })
      await this.#removeRestoreJournal()
      await syncDirectory(dirname(this.#buddyHome))
      this.#reconciliationRequired = false
    }
    catch {
      this.#reconciliationRequired = true
      throw new Error('Runtime data restore completed but cleanup requires reconciliation')
    }
    const refreshedSafetyBackup = await this.#loadDataBackup(safetyBackup.id)
      .then(async backup => ({
        ...backup.summary,
        restoreCapacity: await this.#assessRestoreCapacity(backup),
        status: 'valid' as const,
      }))
      .catch(() => ({ ...safetyBackup, restoreCapacity: null }))
    return {
      backupId,
      restoredAt: new Date().toISOString(),
      safetyBackup: refreshedSafetyBackup,
    }
  }

  async openDataDirectory(): Promise<{ ok: true }> {
    if (this.isDataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    this.#assertRuntimeFullyOffline('Opening Buddy data')
    await mkdir(this.#buddyHome, { mode: 0o700, recursive: true })
    await chmod(this.#buddyHome, 0o700)
    const error = await this.#openPath(this.#buddyHome)
    if (error)
      throw new Error(error)
    return { ok: true }
  }

  async #createDataBackup(
    purpose: RuntimeDataBackupPurpose,
    control?: RuntimeDataOperationControl,
  ): Promise<RuntimeDataBackup> {
    const source = await lstat(this.#buddyHome)
    if (!source.isDirectory())
      throw new Error('Buddy data path is not a directory')

    await this.#prepareBackupsDirectory()
    await this.#assertRealPathsDoNotOverlap()
    const sourceUsage = await inspectDataUsage(this.#buddyHome, 'Runtime data')
    const availableBytes = await this.#getStorageAvailableBytes(this.#backupsDirectory)
    if (availableBytes < requiredAvailableBytes(sourceUsage.totalBytes))
      throw new Error('Insufficient storage capacity for Runtime data backup')
    const createdAt = new Date().toISOString()
    const id = `buddy-${compactTimestamp(createdAt)}-${randomUUID().slice(0, 8)}`
    const temporaryPath = join(this.#backupsDirectory, `.${id}.tmp`)
    const destinationPath = this.#backupPath(id)
    const dataPath = join(temporaryPath, 'data')
    try {
      this.#checkpointDataOperation(
        control,
        purpose === 'manual' ? 'copying_backup' : 'creating_safety_backup',
        { completedBytes: 0, totalBytes: sourceUsage.totalBytes },
      )
      await mkdir(temporaryPath, { mode: 0o700 })
      await copyDataDirectory(this.#buddyHome, dataPath, {
        onProgress: control
          ? completedBytes => this.#replaceDataOperation(
            { completedBytes },
            control.operationId,
          )
          : undefined,
        signal: control?.signal,
      })
      await chmod(dataPath, 0o700)
      this.#checkpointDataOperation(
        control,
        purpose === 'manual' ? 'verifying_backup' : 'creating_safety_backup',
        { completedBytes: sourceUsage.totalBytes },
      )
      const entries = await inspectManifestData(dataPath, control?.signal)
      const manifest: BackupManifest = {
        backupId: id,
        createdAt,
        entries,
        format: BACKUP_FORMAT,
        purpose,
        version: BACKUP_VERSION,
      }
      const parsedManifest = backupManifestSchema.parse(manifest)
      await writeFile(
        join(temporaryPath, 'manifest.json'),
        `${JSON.stringify(parsedManifest)}\n`,
        { mode: 0o600 },
      )
      if (purpose === 'manual')
        this.#checkpointDataOperation(control, 'publishing', { cancellable: false })
      else
        this.#throwIfDataOperationCancelled(control)
      await rename(temporaryPath, destinationPath)
      await syncDirectory(this.#backupsDirectory)
      const loaded = {
        dataPath: join(destinationPath, 'data'),
        manifest: parsedManifest,
        summary: createBackupSummary(destinationPath, parsedManifest, 'valid'),
      }
      return {
        ...loaded.summary,
        restoreCapacity: await this.#assessRestoreCapacity(loaded).catch(() => null),
      }
    }
    catch (error) {
      await rm(temporaryPath, { force: true, recursive: true }).catch(() => {})
      throw error
    }
  }

  async #loadDataBackup(backupId: string): Promise<LoadedBackup> {
    const path = this.#backupPath(backupId)
    await assertRealDirectory(path, 'Backup path')
    const manifestPath = join(path, 'manifest.json')
    const manifestMetadata = await lstat(manifestPath)
    if (
      !manifestMetadata.isFile()
      || manifestMetadata.isSymbolicLink()
      || manifestMetadata.size > MAX_MANIFEST_BYTES
    ) {
      throw new Error('Backup manifest is not a supported regular file')
    }
    const manifest = backupManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
    if (manifest.backupId !== backupId)
      throw new Error('Backup identifier does not match its manifest')
    const dataPath = join(path, 'data')
    await assertRealDirectory(dataPath, 'Backup data path')
    return {
      dataPath,
      manifest,
      summary: createBackupSummary(path, manifest, 'unverified'),
    }
  }

  async #readBackupSummary(backupId: string): Promise<RuntimeDataBackup> {
    const path = this.#backupPath(backupId)
    try {
      return (await this.#loadDataBackup(backupId)).summary
    }
    catch {
      return {
        createdAt: null,
        fileCount: 0,
        id: backupId,
        path,
        purpose: null,
        restoreCapacity: null,
        status: 'invalid',
        totalBytes: 0,
      }
    }
  }

  async #listPreparedDataBackups(): Promise<ReadonlyArray<RuntimeDataBackup>> {
    const entries = await readdir(this.#backupsDirectory, { withFileTypes: true })
    const backups = await Promise.all(entries
      .filter(entry => entry.isDirectory() && BACKUP_ID_PATTERN.test(entry.name))
      .map(entry => this.#readBackupSummary(entry.name)))
    return backups.sort(compareBackups)
  }

  async #assessRestoreCapacity(backup: LoadedBackup): Promise<RuntimeDataRestoreCapacity> {
    const currentUsage = await inspectDataUsage(this.#buddyHome, 'Runtime data')
    const targetDataBytes = manifestTotalBytes(backup.manifest)
    const backupStoragePath = this.#backupsDirectory
    const buddyStoragePath = dirname(this.#buddyHome)
    const [backupDevice, buddyDevice] = await Promise.all([
      getStorageDeviceId(backupStoragePath),
      getStorageDeviceId(buddyStoragePath),
    ])
    let requirements: RuntimeStorageRequirement[]
    if (backupDevice === buddyDevice) {
      const availableBytes = await this.#getStorageAvailableBytes(backupStoragePath)
      requirements = [createStorageRequirement(
        'shared',
        availableBytes,
        requiredAvailableBytes(currentUsage.totalBytes, targetDataBytes),
      )]
    }
    else {
      const [backupAvailableBytes, buddyAvailableBytes] = await Promise.all([
        this.#getStorageAvailableBytes(backupStoragePath),
        this.#getStorageAvailableBytes(buddyStoragePath),
      ])
      requirements = [
        createStorageRequirement(
          'backups',
          backupAvailableBytes,
          requiredAvailableBytes(currentUsage.totalBytes),
        ),
        createStorageRequirement(
          'buddy',
          buddyAvailableBytes,
          requiredAvailableBytes(targetDataBytes),
        ),
      ]
    }
    return {
      checkedAt: new Date().toISOString(),
      currentDataBytes: currentUsage.totalBytes,
      requirements,
      sufficient: requirements.every(requirement => requirement.sufficient),
      targetDataBytes,
    }
  }

  async #prepareBackupsDirectory(): Promise<number> {
    await mkdir(this.#backupsDirectory, { mode: 0o700, recursive: true })
    await assertRealDirectory(this.#backupsDirectory, 'Runtime backup path')
    await chmod(this.#backupsDirectory, 0o700)
    const entries = await readdir(this.#backupsDirectory, { withFileTypes: true })
    const interrupted = entries.filter(entry => BACKUP_TEMPORARY_ID_PATTERN.test(entry.name))
    if (interrupted.length === 0)
      return 0
    const deviceId = await getStorageDeviceId(this.#backupsDirectory)
    for (const entry of interrupted) {
      const path = join(this.#backupsDirectory, entry.name)
      await assertRealDirectory(path, 'Interrupted Runtime backup path')
      await assertSafeDeletionTree(path, deviceId)
      await rm(path, { recursive: true })
    }
    await syncDirectory(this.#backupsDirectory)
    return interrupted.length
  }

  async #assertRealPathsDoNotOverlap(): Promise<void> {
    const [backupsDirectory, buddyHome] = await Promise.all([
      realpath(this.#backupsDirectory),
      realpath(this.#buddyHome),
    ])
    if (
      isPathWithin(buddyHome, backupsDirectory)
      || isPathWithin(backupsDirectory, buddyHome)
    ) {
      throw new Error('Runtime backup and Buddy data paths must not overlap')
    }
  }

  async #reconcileInterruptedRestore(): Promise<RuntimeDataRecoveryReceipt | null> {
    const journal = await readOptionalRecoveryMetadata(
      this.#restoreJournalPath,
      restoreJournalSchema,
      'Runtime restore journal',
    )
    const buddyHomeExists = await pathExists(this.#buddyHome)
    const rollbackExists = await pathExists(this.#restoreRollbackPath)
    const stagingExists = await pathExists(this.#restoreStagingPath)
    if (buddyHomeExists)
      await assertRealDirectory(this.#buddyHome, 'Buddy data path')
    if (rollbackExists)
      await assertRealDirectory(this.#restoreRollbackPath, 'Runtime restore rollback path')
    if (stagingExists)
      await assertRealDirectory(this.#restoreStagingPath, 'Runtime restore staging path')
    let action: RuntimeDataRecoveryAction | null = null
    if (rollbackExists) {
      if (buddyHomeExists) {
        await rm(this.#restoreRollbackPath, { force: true, recursive: true })
        action = 'kept_restored_data'
      }
      else {
        await rename(this.#restoreRollbackPath, this.#buddyHome)
        action = 'restored_previous_data'
      }
    }
    if (stagingExists) {
      await rm(this.#restoreStagingPath, { force: true, recursive: true })
      action ??= 'discarded_restore_candidate'
    }
    if (!action && journal) {
      if (!await pathExists(this.#buddyHome))
        throw new Error('Runtime restore journal exists without recoverable Buddy data')
      action = journal.phase === 'candidate_published'
        ? 'kept_restored_data'
        : 'discarded_restore_candidate'
    }
    if (journal)
      await this.#removeRestoreJournal()
    if (action)
      await syncDirectory(dirname(this.#buddyHome))
    return action ? createDataRecoveryReceipt(action, journal) : null
  }

  async #writeRestoreJournal(journal: RestoreJournal): Promise<void> {
    await writeDurableJson(this.#restoreJournalPath, restoreJournalSchema.parse(journal))
  }

  async #removeRestoreJournal(): Promise<void> {
    await removeDurableFile(this.#restoreJournalPath)
  }

  async #readDataRecoveryReceipt(): Promise<RuntimeDataRecoveryReceipt | null> {
    const receipt = await readOptionalRecoveryMetadata(
      this.#recoveryReceiptPath,
      dataRecoveryReceiptFileSchema,
      'Runtime data recovery receipt',
    ).catch(() => null)
    if (!receipt)
      return null
    return {
      action: receipt.action,
      backupId: receipt.backupId,
      completedAt: receipt.completedAt,
      operationId: receipt.operationId,
    }
  }

  async #writeDataRecoveryReceipt(receipt: RuntimeDataRecoveryReceipt): Promise<void> {
    await writeDurableJson(this.#recoveryReceiptPath, dataRecoveryReceiptFileSchema.parse({
      ...receipt,
      format: RECOVERY_RECEIPT_FORMAT,
      version: RECOVERY_RECEIPT_VERSION,
    }))
  }

  async #removeRecoveryMetadataTemporaryFiles(): Promise<void> {
    await Promise.all([
      removeOwnedTemporaryFile(`${this.#recoveryReceiptPath}.tmp`),
      removeOwnedTemporaryFile(`${this.#restoreJournalPath}.tmp`),
    ])
  }

  #backupPath(backupId: string): string {
    backupIdSchema.parse(backupId)
    return join(this.#backupsDirectory, backupId)
  }

  #assertRuntimeFullyOffline(operation: string): void {
    const state = this.#getRuntimeState()
    if (state.status !== 'offline')
      throw new Error(`${operation} requires an offline runtime`)
    if (state.pid !== null)
      throw new Error(`${operation} requires the previous process to be terminated`)
  }

  #startDataOperation(
    kind: RuntimeDataOperationKind,
    backupId: string | null,
  ): RuntimeDataOperation {
    if (this.isDataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    const operationId = randomUUID()
    const controller = new AbortController()
    const operation: RuntimeDataOperation = {
      backupId,
      cancellable: true,
      completedAt: null,
      completedBytes: 0,
      kind,
      operationId,
      result: null,
      stage: 'preparing',
      startedAt: new Date().toISOString(),
      status: 'running',
      totalBytes: null,
    }
    this.#dataOperation = { controller, value: operation }
    const control = { operationId, signal: controller.signal }
    const task: Promise<RuntimeDataBackup | RuntimeDataRestore> = kind === 'backup'
      ? this.#runDataMutation(() => this.#createManualDataBackup(control))
      : this.#runDataMutation(() => this.#restoreDataBackup(backupId!, control))
    this.#emitDataOperation(operation)
    void task.then(
      result => this.#completeDataOperation(operationId, result),
      error => this.#failDataOperation(operationId, error),
    )
    return operation
  }

  #checkpointDataOperation(
    control: RuntimeDataOperationControl | undefined,
    stage: RuntimeDataOperationStage,
    progress: Partial<Pick<RuntimeDataOperation, 'cancellable' | 'completedBytes' | 'totalBytes'>> = {},
  ): void {
    this.#throwIfDataOperationCancelled(control)
    if (!control)
      return
    this.#replaceDataOperation({ stage, ...progress }, control.operationId)
  }

  #throwIfDataOperationCancelled(control?: RuntimeDataOperationControl): void {
    if (control?.signal.aborted)
      throw new RuntimeDataOperationCancelledError()
  }

  #completeDataOperation(
    operationId: string,
    result: RuntimeDataBackup | RuntimeDataRestore,
  ): void {
    this.#replaceDataOperation({
      cancellable: false,
      completedAt: new Date().toISOString(),
      result,
      stage: 'completed',
      status: 'completed',
    }, operationId)
  }

  #failDataOperation(operationId: string, error: unknown): void {
    const cancelled = error instanceof RuntimeDataOperationCancelledError
      || (error instanceof Error && error.name === 'AbortError')
    this.#replaceDataOperation({
      cancellable: false,
      completedAt: new Date().toISOString(),
      result: null,
      status: cancelled ? 'cancelled' : 'failed',
    }, operationId)
  }

  #replaceDataOperation(
    patch: Partial<RuntimeDataOperation>,
    operationId = this.#dataOperation?.value.operationId,
  ): void {
    const operation = this.#dataOperation
    if (!operation || operation.value.operationId !== operationId)
      return
    operation.value = { ...operation.value, ...patch }
    this.#emitDataOperation(operation.value)
  }

  #emitDataOperation(operation: RuntimeDataOperation): void {
    for (const listener of this.#operationListeners) {
      try {
        listener(operation)
      }
      catch {}
    }
  }

  async #runDataMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#isShuttingDown)
      throw new Error('Runtime data recovery service is shutting down')
    if (this.isDataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    this.#dataMutationInProgress = true
    try {
      return await operation()
    }
    finally {
      this.#dataMutationInProgress = false
      for (const resolve of this.#idleWaiters)
        resolve()
      this.#idleWaiters.clear()
    }
  }

  async #runReconciliation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#isShuttingDown)
      throw new Error('Runtime data recovery service is shutting down')
    if (this.#dataMutationInProgress)
      throw new Error('Runtime data mutation is already in progress')
    this.#dataMutationInProgress = true
    try {
      return await operation()
    }
    finally {
      this.#dataMutationInProgress = false
      for (const resolve of this.#idleWaiters)
        resolve()
      this.#idleWaiters.clear()
    }
  }
}

function createDataRecoveryReceipt(
  action: RuntimeDataRecoveryAction,
  journal: RestoreJournal | null,
): RuntimeDataRecoveryReceipt {
  return {
    action,
    backupId: journal?.backupId ?? null,
    completedAt: new Date().toISOString(),
    operationId: journal?.operationId ?? null,
  }
}

async function readOptionalRecoveryMetadata<T>(
  path: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T | null> {
  if (!await pathExists(path))
    return null
  const metadata = await lstat(path)
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.size > MAX_RECOVERY_METADATA_BYTES
  ) {
    throw new Error(`${label} is not a supported regular file`)
  }
  return schema.parse(JSON.parse(await readFile(path, 'utf8')))
}

async function writeDurableJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await removeOwnedTemporaryFile(temporaryPath)
  const handle = await openFile(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8')
    await handle.sync()
  }
  finally {
    await handle.close()
  }
  await rename(temporaryPath, path)
  await syncDirectory(dirname(path))
}

async function removeDurableFile(path: string): Promise<void> {
  await rm(path, { force: true })
  await syncDirectory(dirname(path))
}

async function removeOwnedTemporaryFile(path: string): Promise<void> {
  await rm(path, { force: true })
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await openFile(path, 'r')
  try {
    await handle.sync()
  }
  finally {
    await handle.close()
  }
}

interface CopyDataDirectoryOptions {
  onProgress?: (completedBytes: number) => void
  signal?: AbortSignal
}

async function copyDataDirectory(
  sourceRoot: string,
  destinationRoot: string,
  options: CopyDataDirectoryOptions = {},
): Promise<void> {
  const source = await lstat(sourceRoot)
  if (!source.isDirectory() || source.isSymbolicLink())
    throw new Error('Runtime copy source must be a real directory')
  throwIfAborted(options.signal)
  await mkdir(destinationRoot, { mode: source.mode & 0o777 })
  await chmod(destinationRoot, source.mode & 0o777)
  let completedBytes = 0
  await copyDataDirectoryEntries(sourceRoot, destinationRoot, '', options, (size) => {
    completedBytes = safeByteSum(completedBytes, size)
    options.onProgress?.(completedBytes)
  })
}

async function copyDataDirectoryEntries(
  sourceRoot: string,
  destinationRoot: string,
  directory: string,
  options: CopyDataDirectoryOptions,
  onFileCopied: (size: number) => void,
): Promise<void> {
  const children = await readdir(join(sourceRoot, ...manifestPathSegments(directory)))
  children.sort(compareManifestPath)
  for (const child of children) {
    throwIfAborted(options.signal)
    const path = directory ? `${directory}/${child}` : child
    const segments = manifestPathSegments(path)
    const sourcePath = join(sourceRoot, ...segments)
    const destinationPath = join(destinationRoot, ...segments)
    const metadata = await lstat(sourcePath)
    if (metadata.isSymbolicLink())
      throw new Error(`Runtime data contains an unsupported symbolic link: ${path}`)
    if (metadata.isDirectory()) {
      await mkdir(destinationPath, { mode: metadata.mode & 0o777 })
      await chmod(destinationPath, metadata.mode & 0o777)
      await copyDataDirectoryEntries(
        sourceRoot,
        destinationRoot,
        path,
        options,
        onFileCopied,
      )
      continue
    }
    if (!metadata.isFile())
      throw new Error(`Runtime data contains an unsupported file type: ${path}`)
    await pipeline(
      createReadStream(sourcePath),
      createWriteStream(destinationPath, {
        flags: 'wx',
        mode: metadata.mode & 0o777,
      }),
      { signal: options.signal },
    )
    await chmod(destinationPath, metadata.mode & 0o777)
    onFileCopied(metadata.size)
  }
}

async function inspectManifestData(
  root: string,
  signal?: AbortSignal,
): Promise<BackupManifestEntry[]> {
  await assertRealDirectory(root, 'Backup data path')
  throwIfAborted(signal)
  const entries: BackupManifestEntry[] = []
  await inspectDirectory(root, '', entries, signal)
  if (entries.length > MAX_BACKUP_ENTRIES)
    throw new Error('Runtime data contains too many backup entries')
  return entries.sort((left, right) => compareManifestPath(left.path, right.path))
}

interface DataUsage {
  fileCount: number
  totalBytes: number
}

async function inspectDataUsage(root: string, label: string): Promise<DataUsage> {
  await assertRealDirectory(root, `${label} path`)
  const usage: DataUsage = { fileCount: 0, totalBytes: 0 }
  await inspectDirectoryUsage(root, '', label, usage)
  return usage
}

async function inspectDirectoryUsage(
  root: string,
  directory: string,
  label: string,
  usage: DataUsage,
): Promise<void> {
  const children = await readdir(join(root, ...manifestPathSegments(directory)))
  for (const child of children) {
    const path = directory ? `${directory}/${child}` : child
    const absolutePath = join(root, ...manifestPathSegments(path))
    const metadata = await lstat(absolutePath)
    if (metadata.isSymbolicLink())
      throw new Error(`${label} contains an unsupported symbolic link: ${path}`)
    if (metadata.isDirectory()) {
      await inspectDirectoryUsage(root, path, label, usage)
      continue
    }
    if (!metadata.isFile())
      throw new Error(`${label} contains an unsupported file type: ${path}`)
    usage.fileCount += 1
    usage.totalBytes = safeByteSum(usage.totalBytes, metadata.size)
  }
}

async function inspectDirectory(
  root: string,
  directory: string,
  entries: BackupManifestEntry[],
  signal?: AbortSignal,
): Promise<void> {
  const children = await readdir(join(root, ...manifestPathSegments(directory)))
  children.sort(compareManifestPath)
  for (const child of children) {
    throwIfAborted(signal)
    const path = directory ? `${directory}/${child}` : child
    const absolutePath = join(root, ...manifestPathSegments(path))
    const metadata = await lstat(absolutePath)
    const mode = metadata.mode & 0o777
    if (metadata.isSymbolicLink())
      throw new Error(`Runtime data contains an unsupported symbolic link: ${path}`)
    if (metadata.isDirectory()) {
      assertBackupEntryCapacity(entries)
      entries.push({ kind: 'directory', mode, path })
      await inspectDirectory(root, path, entries, signal)
      continue
    }
    if (!metadata.isFile())
      throw new Error(`Runtime data contains an unsupported file type: ${path}`)
    assertBackupEntryCapacity(entries)
    entries.push({
      kind: 'file',
      mode,
      path,
      sha256: await hashFile(absolutePath, signal),
      size: metadata.size,
    })
  }
}

async function verifyManifestData(
  root: string,
  manifest: BackupManifest,
  signal?: AbortSignal,
): Promise<void> {
  const actualEntries = await inspectManifestData(root, signal)
  if (actualEntries.length !== manifest.entries.length)
    throw new Error('Backup entry count does not match its manifest')
  for (const [index, expected] of manifest.entries.entries()) {
    const actual = actualEntries[index]
    if (!actual || JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Backup entry does not match its manifest: ${expected.path}`)
  }
}

async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path, { signal }))
    hash.update(chunk)
  return hash.digest('hex')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new RuntimeDataOperationCancelledError()
}

function createBackupSummary(
  path: string,
  manifest: BackupManifest,
  status: RuntimeDataBackupStatus,
): RuntimeDataBackup {
  const files = manifest.entries.filter(entry => entry.kind === 'file')
  return {
    createdAt: manifest.createdAt,
    fileCount: files.length,
    id: manifest.backupId,
    path,
    purpose: manifest.purpose,
    restoreCapacity: null,
    status,
    totalBytes: manifestTotalBytes(manifest),
  }
}

function manifestTotalBytes(manifest: BackupManifest): number {
  return manifest.entries.reduce(
    (total, entry) => entry.kind === 'file' ? safeByteSum(total, entry.size) : total,
    0,
  )
}

function requiredAvailableBytes(...payloads: number[]): number {
  return payloads.reduce(
    (total, payload) => safeByteSum(total, copyWorkspaceBytes(payload)),
    MIN_POST_OPERATION_FREE_BYTES,
  )
}

function copyWorkspaceBytes(payloadBytes: number): number {
  const overheadBytes = Math.max(
    MIN_COPY_OVERHEAD_BYTES,
    Math.ceil(payloadBytes * COPY_OVERHEAD_RATIO),
  )
  return safeByteSum(payloadBytes, overheadBytes)
}

function safeByteSum(left: number, right: number): number {
  const total = left + right
  if (!Number.isSafeInteger(total))
    throw new Error('Runtime data size exceeds the supported range')
  return total
}

function createStorageRequirement(
  scope: RuntimeStorageRequirementScope,
  availableBytes: number,
  requiredBytes: number,
): RuntimeStorageRequirement {
  return {
    availableBytes,
    requiredBytes,
    scope,
    sufficient: availableBytes >= requiredBytes,
  }
}

async function getStorageAvailableBytes(path: string): Promise<number> {
  const storage = await statfs(path, { bigint: true })
  return safeBigIntByteCount(storage.bavail * storage.bsize)
}

async function getStorageDeviceId(path: string): Promise<string> {
  return (await stat(path, { bigint: true })).dev.toString()
}

function safeBigIntByteCount(value: bigint): number {
  if (value < 0n)
    return 0
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    return Number.MAX_SAFE_INTEGER
  return Number(value)
}

function compareBackups(left: RuntimeDataBackup, right: RuntimeDataBackup): number {
  if (left.createdAt && right.createdAt)
    return right.createdAt.localeCompare(left.createdAt)
  if (left.createdAt)
    return -1
  if (right.createdAt)
    return 1
  return right.id.localeCompare(left.id)
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, error => isMissingPathError(error) ? false : Promise.reject(error))
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error(`${label} must be a real directory`)
}

async function assertSafeDeletionTree(root: string, expectedDeviceId: string): Promise<void> {
  const rootMetadata = await lstat(root)
  if (rootMetadata.dev.toString() !== expectedDeviceId)
    throw new Error('Backup deletion cannot cross storage devices')
  await assertSafeDeletionDirectory(root, '', expectedDeviceId)
}

async function assertSafeDeletionDirectory(
  root: string,
  directory: string,
  expectedDeviceId: string,
): Promise<void> {
  const children = await readdir(join(root, ...manifestPathSegments(directory)))
  for (const child of children) {
    const path = directory ? `${directory}/${child}` : child
    const metadata = await lstat(join(root, ...manifestPathSegments(path)))
    if (metadata.isSymbolicLink())
      throw new Error(`Backup deletion contains an unsupported symbolic link: ${path}`)
    if (metadata.dev.toString() !== expectedDeviceId)
      throw new Error(`Backup deletion cannot cross storage devices: ${path}`)
    if (metadata.isDirectory()) {
      await assertSafeDeletionDirectory(root, path, expectedDeviceId)
      continue
    }
    if (!metadata.isFile())
      throw new Error(`Backup deletion contains an unsupported file type: ${path}`)
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function compactTimestamp(timestamp: string): string {
  return timestamp.replaceAll(/\D/g, '').slice(0, 17)
}

function compareManifestPath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function assertBackupEntryCapacity(entries: BackupManifestEntry[]): void {
  if (entries.length >= MAX_BACKUP_ENTRIES)
    throw new Error('Runtime data contains too many backup entries')
}

function isSafeManifestPath(path: string): boolean {
  if (path.includes('\\') || path.includes('\0') || posix.isAbsolute(path))
    return false
  const segments = path.split('/')
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && posix.normalize(path) === path
}

function manifestPathSegments(path: string): string[] {
  return path ? path.split('/') : []
}

function isPathWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}
