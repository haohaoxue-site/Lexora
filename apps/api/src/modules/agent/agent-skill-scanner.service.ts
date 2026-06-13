import type { AgentSkillCategory, AgentSkillRiskLevel } from '@haohaoxue/lexora-contracts'
import type { AgentSkillsConfig } from '../../config/agent-skills.config'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  AGENT_SKILL_ACTIVATION_MODE,
  AGENT_SKILL_CATEGORY,
  AGENT_SKILL_RISK_LEVEL,
} from '@haohaoxue/lexora-contracts'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'

interface ScannedSkillPackage {
  skillKey: string
  name: string
  description: string
  category: AgentSkillCategory
  activationMode: string
  riskLevel: AgentSkillRiskLevel
  version: string | null
  rootPath: string
  skillMdPath: string
  packageHash: string
  frontmatter: Record<string, unknown>
  instructions: string
  status: 'ACTIVE' | 'QUARANTINED'
  files: ScannedSkillFile[]
}

interface ScannedSkillFile {
  relPath: string
  sizeBytes: number
  sha256: string
  executable: boolean
}

const MAX_SCAN_DEPTH = 6
const MAX_FILES_PER_SKILL = 500
const MAX_SKILL_MD_BYTES = 512 * 1024
const MAX_RESOURCE_FILE_BYTES = 5 * 1024 * 1024
const MAX_PACKAGE_BYTES = 25 * 1024 * 1024
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '__pycache__'])

class SkillScanRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = SkillScanRejectedError.name
  }
}

@Injectable()
export class AgentSkillScannerService implements OnModuleInit {
  private readonly logger = new Logger(AgentSkillScannerService.name)
  private readonly config: AgentSkillsConfig

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.config = configService.getOrThrow<AgentSkillsConfig>('agentSkills')
  }

  async onModuleInit(): Promise<void> {
    await this.syncLocalSkillPackages()
  }

  async syncLocalSkillPackages(): Promise<void> {
    if (!(await pathExists(this.config.rootDir))) {
      return
    }

    const rootDir = await realpath(this.config.rootDir)
    const packages = await scanSkillPackages(rootDir)
    for (const item of packages) {
      try {
        await this.upsertSkillPackage(item)
      }
      catch (error) {
        this.logger.warn(`skill package sync failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await this.reconcileLocalSkillPackages(rootDir, packages)
  }

  private async upsertSkillPackage(item: ScannedSkillPackage): Promise<void> {
    await this.prisma.$bypass.$transaction(async (tx) => {
      const skill = await tx.agentSkill.upsert({
        where: {
          skillKey: item.skillKey,
        },
        create: {
          scope: 'MARKET',
          skillKey: item.skillKey,
          name: item.name,
          description: item.description,
          category: item.category,
          activationMode: item.activationMode,
          riskLevel: item.riskLevel,
          version: item.version,
          sourcePath: item.rootPath,
          rootPath: item.rootPath,
          skillMdPath: item.skillMdPath,
          packageHash: item.packageHash,
          frontmatter: toJsonObject(item.frontmatter),
          instructions: item.instructions,
          trustLevel: item.status === 'ACTIVE' ? 'TRUSTED' : 'QUARANTINED',
          enabled: item.status === 'ACTIVE',
        },
        update: {
          skillKey: item.skillKey,
          name: item.name,
          description: item.description,
          category: item.category,
          activationMode: item.activationMode,
          riskLevel: item.riskLevel,
          version: item.version,
          rootPath: item.rootPath,
          skillMdPath: item.skillMdPath,
          packageHash: item.packageHash,
          frontmatter: toJsonObject(item.frontmatter),
          instructions: item.instructions,
          trustLevel: item.status === 'ACTIVE' ? 'TRUSTED' : 'QUARANTINED',
          enabled: item.status === 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
        },
      })

      await tx.agentSkillFile.deleteMany({
        where: {
          skillId: skill.id,
        },
      })

      if (item.files.length > 0) {
        await tx.agentSkillFile.createMany({
          data: item.files.map(file => ({
            skillId: skill.id,
            relPath: file.relPath,
            sizeBytes: BigInt(file.sizeBytes),
            sha256: file.sha256,
            executable: file.executable,
          })),
        })
      }
    })
  }

  private async reconcileLocalSkillPackages(rootDir: string, syncedPackages: ScannedSkillPackage[]): Promise<void> {
    const syncedRootPaths = new Set(syncedPackages.map(item => item.rootPath))
    const localSkills = await this.prisma.agentSkill.findMany({
      where: {
        scope: 'MARKET',
        deletedAt: null,
      },
      select: {
        id: true,
        sourcePath: true,
      },
    })
    const staleSkillIds = localSkills
      .filter(skill => isInside(rootDir, skill.sourcePath) && !syncedRootPaths.has(skill.sourcePath))
      .map(skill => skill.id)

    if (staleSkillIds.length === 0) {
      return
    }

    const deletedAt = new Date()
    await this.prisma.agentSkill.updateMany({
      where: {
        id: { in: staleSkillIds },
        deletedAt: null,
      },
      data: {
        enabled: false,
        trustLevel: 'QUARANTINED',
        deletedAt,
      },
    })
  }
}

async function scanSkillPackages(rootDir: string): Promise<ScannedSkillPackage[]> {
  const skillMdPaths = await findSkillMdPaths(rootDir)
  const packages: ScannedSkillPackage[] = []
  for (const skillMdPath of skillMdPaths) {
    const item = await scanSkillPackage(rootDir, skillMdPath)
    if (item) {
      packages.push(item)
    }
  }

  return packages
}

async function findSkillMdPaths(rootDir: string): Promise<string[]> {
  const results: string[] = []

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) {
      return
    }

    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) {
          await visit(absolutePath, depth + 1)
        }
        continue
      }

      if (entry.isFile() && (entry.name === 'SKILL.md' || entry.name === 'skill.md')) {
        results.push(absolutePath)
      }
    }
  }

  await visit(rootDir, 0)
  return results
}

async function scanSkillPackage(rootDir: string, skillMdPath: string): Promise<ScannedSkillPackage | null> {
  const realRoot = await realpath(rootDir)
  const realSkillMdPath = await realpath(skillMdPath)
  assertInside(realRoot, realSkillMdPath)

  const skillMdStat = await stat(realSkillMdPath)
  if (skillMdStat.size > MAX_SKILL_MD_BYTES) {
    return null
  }

  const raw = await readFile(realSkillMdPath, 'utf8')
  const parsed = parseSkillMarkdown(raw)
  const skillRoot = path.dirname(realSkillMdPath)
  let files: ScannedSkillFile[]
  try {
    files = await listSkillFiles(skillRoot)
  }
  catch (error) {
    if (error instanceof SkillScanRejectedError) {
      return null
    }
    throw error
  }
  if (files.length > MAX_FILES_PER_SKILL) {
    return null
  }

  const skillKey = normalizeSkillKey(readString(parsed.frontmatter.name) ?? path.basename(skillRoot))
  const description = readString(parsed.frontmatter.description)
  if (!skillKey || !description) {
    return null
  }

  const packageHash = hashText(files
    .slice()
    .sort((left, right) => left.relPath.localeCompare(right.relPath))
    .map(file => `${file.relPath}:${file.sha256}`)
    .join('\n'))

  return {
    skillKey,
    name: readString(parsed.frontmatter.title) ?? skillKey,
    description,
    category: resolveCategory(parsed.frontmatter),
    activationMode: AGENT_SKILL_ACTIVATION_MODE.MODEL_SELECTED,
    riskLevel: resolveRiskLevel(parsed.frontmatter),
    version: readNestedString(parsed.frontmatter, ['metadata', 'version']) ?? readString(parsed.frontmatter.version),
    rootPath: skillRoot,
    skillMdPath: realSkillMdPath,
    packageHash,
    frontmatter: parsed.frontmatter,
    instructions: parsed.content,
    status: isValidSkillKey(skillKey) ? 'ACTIVE' : 'QUARANTINED',
    files,
  }
}

async function listSkillFiles(skillRoot: string): Promise<ScannedSkillFile[]> {
  const realRoot = await realpath(skillRoot)
  const files: ScannedSkillFile[] = []
  let totalBytes = 0

  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) {
      return
    }

    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      const relPath = path.relative(realRoot, absolutePath).split(path.sep).join('/')

      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) {
          await visit(absolutePath, depth + 1)
        }
        continue
      }

      const itemStat = await lstat(absolutePath)
      if (!itemStat.isFile() || itemStat.isSymbolicLink()) {
        continue
      }
      if (files.length >= MAX_FILES_PER_SKILL) {
        throw new SkillScanRejectedError(`Skill package contains too many files: ${skillRoot}`)
      }
      if (itemStat.size > MAX_RESOURCE_FILE_BYTES) {
        throw new SkillScanRejectedError(`Skill package file is too large: ${absolutePath}`)
      }
      if (totalBytes + itemStat.size > MAX_PACKAGE_BYTES) {
        throw new SkillScanRejectedError(`Skill package is too large: ${skillRoot}`)
      }

      const realFilePath = await realpath(absolutePath)
      assertInside(realRoot, realFilePath)
      const buffer = await readFile(realFilePath)
      totalBytes += itemStat.size
      files.push({
        relPath,
        sizeBytes: itemStat.size,
        sha256: hashBuffer(buffer),
        executable: Boolean(itemStat.mode & constants.S_IXUSR),
      })
    }
  }

  await visit(realRoot, 0)
  return files
}

function parseSkillMarkdown(raw: string): { frontmatter: Record<string, unknown>, content: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, content: raw.trim() }
  }

  const lines = raw.split(/\r?\n/)
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (endIndex <= 0) {
    return { frontmatter: {}, content: raw.trim() }
  }

  return {
    frontmatter: parseSimpleYamlFrontmatter(lines.slice(1, endIndex)),
    content: lines.slice(endIndex + 1).join('\n').trim(),
  }
}

function parseSimpleYamlFrontmatter(lines: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  let currentArrayKey: string | null = null
  let currentObjectKey: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    if (!line.trim() || line.trim().startsWith('#')) {
      continue
    }

    const listValue = parseYamlListItem(line)
    if (listValue !== null && currentArrayKey) {
      const current = output[currentArrayKey]
      if (Array.isArray(current)) {
        current.push(parseYamlScalar(listValue))
      }
      continue
    }

    const nested = countLeadingSpaces(line) >= 2 ? parseYamlKeyValue(line.trimStart()) : null
    if (nested && currentObjectKey) {
      const current = output[currentObjectKey]
      if (isPlainRecord(current)) {
        current[nested.key] = parseYamlScalar(nested.value)
      }
      continue
    }

    const field = parseYamlKeyValue(line)
    if (!field) {
      continue
    }

    const key = field.key
    const rawValue = field.value
    currentArrayKey = null
    currentObjectKey = null

    if (!rawValue) {
      output[key] = key === 'metadata' ? {} : []
      if (key === 'metadata') {
        currentObjectKey = key
      }
      else {
        currentArrayKey = key
      }
      continue
    }

    output[key] = parseYamlScalar(rawValue)
  }

  return output
}

function parseYamlListItem(line: string): string | null {
  const value = line.trimStart()
  if (!value.startsWith('-')) {
    return null
  }

  const content = value.slice(1).trimStart()
  return content || null
}

function parseYamlKeyValue(line: string): { key: string, value: string } | null {
  const separatorIndex = line.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }

  const key = line.slice(0, separatorIndex).trim()
  if (!isYamlKey(key)) {
    return null
  }

  return {
    key,
    value: line.slice(separatorIndex + 1).trimStart(),
  }
}

function isYamlKey(value: string): boolean {
  if (!value) {
    return false
  }

  return [...value].every((char) => {
    const code = char.charCodeAt(0)
    return (code >= 48 && code <= 57)
      || (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || char === '_'
      || char === '-'
  })
}

function countLeadingSpaces(value: string): number {
  let count = 0
  for (const char of value) {
    if (char !== ' ') {
      return count
    }
    count += 1
  }

  return count
}

function parseYamlScalar(rawValue: string): unknown {
  const value = rawValue.trim()
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(item => parseYamlScalar(item)).filter(item => item !== '')
  }
  return value
}

function resolveCategory(frontmatter: Record<string, unknown>): AgentSkillCategory {
  const value = readNestedString(frontmatter, ['metadata', 'category']) ?? readString(frontmatter.category)
  return isAgentSkillCategory(value) ? value : AGENT_SKILL_CATEGORY.PRODUCTIVITY
}

function resolveRiskLevel(frontmatter: Record<string, unknown>): AgentSkillRiskLevel {
  const value = readNestedString(frontmatter, ['metadata', 'risk']) ?? readString(frontmatter.risk)
  return isAgentSkillRiskLevel(value) ? value : AGENT_SKILL_RISK_LEVEL.LOW
}

function isAgentSkillCategory(value: string | null): value is AgentSkillCategory {
  return value === AGENT_SKILL_CATEGORY.MEMORY
    || value === AGENT_SKILL_CATEGORY.PRODUCTIVITY
    || value === AGENT_SKILL_CATEGORY.KNOWLEDGE
    || value === AGENT_SKILL_CATEGORY.COLLABORATION
    || value === AGENT_SKILL_CATEGORY.SYSTEM
}

function isAgentSkillRiskLevel(value: string | null): value is AgentSkillRiskLevel {
  return value === AGENT_SKILL_RISK_LEVEL.LOW
    || value === AGENT_SKILL_RISK_LEVEL.MEDIUM
    || value === AGENT_SKILL_RISK_LEVEL.HIGH
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNestedString(value: Record<string, unknown>, pathSegments: string[]): string | null {
  let current: unknown = value
  for (const segment of pathSegments) {
    if (!isPlainRecord(current)) {
      return null
    }
    current = current[segment]
  }
  return readString(current)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSkillKey(value: string): string {
  return value.trim().toLowerCase()
}

function isValidSkillKey(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value) && !value.includes('--')
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function hashText(value: string): string {
  return hashBuffer(Buffer.from(value))
}

function assertInside(basePath: string, targetPath: string): void {
  if (!isInside(basePath, targetPath)) {
    throw new Error(`Path escapes skill root: ${targetPath}`)
  }
}

function isInside(basePath: string, targetPath: string): boolean {
  const prefix = basePath.endsWith(path.sep) ? basePath : `${basePath}${path.sep}`
  return targetPath === basePath || targetPath.startsWith(prefix)
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await access(value)
    return true
  }
  catch {
    return false
  }
}

function toJsonObject(value: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
}
