import type {
  ActivateAgentSkillRequest,
  ActivateAgentSkillResponse,
  AgentProfileConfig,
  AgentProfileSnapshot,
  AgentRuntimeSkillCatalogItem,
  AgentRuntimeSkillContext,
  AgentSkillBinding,
  AgentSkillBindingConfig,
  AgentSkillCard,
  AgentSkillCategory,
  AgentSkillDefinition,
  AgentSkillResourceFile,
  AgentSkillRiskLevel,
  ListAgentSkillsResponse,
  MutateAgentSkillResponse,
  ReadAgentSkillResourceRequest,
  ReadAgentSkillResourceResponse,
  UpdateAgentSkillConfigResponse,
} from '@haohaoxue/lexora-contracts'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  ActivateAgentSkillResponseSchema,
  AGENT_FIRST_PARTY_SKILL_DEFINITIONS,
  AGENT_LOCATION_SKILL_KEY,
  AGENT_MEMORY_SKILL_KEY,
  AGENT_SKILL_ACTIVATION_MODE,
  AGENT_SKILL_CATEGORY,
  AGENT_SKILL_INSTALL_MODE,
  AGENT_SKILL_RISK_LEVEL,
  AGENT_SKILL_SOURCE_SCOPE,
  AGENT_TIME_SKILL_KEY,
  AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG,
  AGENT_TRANSLATOR_OUTPUT_MODE,
  AGENT_TRANSLATOR_SKILL_KEY,
  AGENT_WEB_SEARCH_SKILL_KEY,
  AgentLocationSkillConfigSchema,
  AgentProfileConfigSchema,
  AgentProfileSnapshotSchema,
  AgentRuntimeSkillContextSchema,
  AgentSkillBindingConfigSchema,
  AgentSkillCategorySchema,
  AgentSkillRiskLevelSchema,
  AgentTimeSkillConfigSchema,
  AgentTranslatorSkillConfigSchema,
  AgentWebSearchSkillConfigSchema,
  ListAgentSkillsResponseSchema,
  MutateAgentSkillResponseSchema,
  ReadAgentSkillResourceResponseSchema,
  UpdateAgentSkillConfigResponseSchema,
} from '@haohaoxue/lexora-contracts'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ChatMessageGenerationStatus,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { AgentProfilesService } from './agent-profiles.service'

const MAX_RESOURCE_BYTES = 5 * 1024 * 1024
const SCRIPT_EXECUTION_ENABLED = false
const builtInSkillByKey = new Map(AGENT_FIRST_PARTY_SKILL_DEFINITIONS.map(skill => [skill.key, skill]))

interface BuiltInSkillConfigHandler {
  defaultConfig: () => AgentSkillBindingConfig
  normalize: (config: unknown) => AgentSkillBindingConfig
  renderInstructions?: (
    definition: (typeof AGENT_FIRST_PARTY_SKILL_DEFINITIONS)[number],
    binding: AgentSkillBinding,
  ) => string
}

const builtInSkillConfigHandlerByKey = {
  [AGENT_MEMORY_SKILL_KEY]: {
    defaultConfig: () => ({}),
    normalize: () => ({}),
  },
  [AGENT_LOCATION_SKILL_KEY]: {
    defaultConfig: () => AgentLocationSkillConfigSchema.parse({}),
    normalize: normalizeLocationSkillConfig,
  },
  [AGENT_TIME_SKILL_KEY]: {
    defaultConfig: () => AgentTimeSkillConfigSchema.parse({}),
    normalize: normalizeTimeSkillConfig,
  },
  [AGENT_TRANSLATOR_SKILL_KEY]: {
    defaultConfig: () => AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG,
    normalize: normalizeTranslatorSkillConfig,
    renderInstructions: renderTranslatorRuntimeInstructions,
  },
  [AGENT_WEB_SEARCH_SKILL_KEY]: {
    defaultConfig: () => AgentWebSearchSkillConfigSchema.parse({}),
    normalize: normalizeWebSearchSkillConfig,
    renderInstructions: renderWebSearchRuntimeInstructions,
  },
} satisfies Record<string, BuiltInSkillConfigHandler>

export function listBuiltInSkillConfigHandlerKeys(): readonly string[] {
  return Object.keys(builtInSkillConfigHandlerByKey)
}

const marketSkillSelect = {
  id: true,
  skillKey: true,
  name: true,
  description: true,
  category: true,
  activationMode: true,
  riskLevel: true,
  rootPath: true,
  instructions: true,
  updatedAt: true,
  files: {
    select: {
      relPath: true,
      sizeBytes: true,
      sha256: true,
      executable: true,
    },
    orderBy: {
      relPath: 'asc',
    },
  },
} satisfies Prisma.AgentSkillSelect

type MarketSkill = Prisma.AgentSkillGetPayload<{
  select: typeof marketSkillSelect
}>

type SkillFileRecord = MarketSkill['files'][number]

type ResolvedSkillDefinition = Pick<
  AgentSkillDefinition,
  'key' | 'installMode' | 'defaultInstalled' | 'defaultEnabled' | 'canDisable' | 'canUninstall' | 'configurable'
> & {
  canInstall: boolean
}

@Injectable()
export class AgentSkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: AgentProfilesService,
  ) {}

  async listDefaultAgentSkills(ownerUserId: string): Promise<ListAgentSkillsResponse> {
    const profile = await this.profiles.ensureDefaultAgentProfile({ ownerUserId })
    const config = AgentProfileConfigSchema.parse(profile.currentConfig)
    const bindingByKey = new Map(config.skillBindings.map(binding => [binding.key, binding]))
    const marketSkills = await this.findActiveMarketSkills()
    const builtInSkills = AGENT_FIRST_PARTY_SKILL_DEFINITIONS.map(definition =>
      toBuiltInSkillCard(definition, bindingByKey.get(definition.key)),
    )
    const marketSkillCards = marketSkills.map(skill =>
      toMarketSkillCard(skill, bindingByKey.get(skill.skillKey)),
    )
    const skills = [...builtInSkills, ...marketSkillCards]

    return ListAgentSkillsResponseSchema.parse({
      skills,
      mySkills: [
        ...builtInSkills.filter(skill => skill.installed),
        ...marketSkillCards.filter(skill => skill.installed),
      ],
    })
  }

  async installDefaultAgentSkill(ownerUserId: string, skillKey: string): Promise<MutateAgentSkillResponse> {
    const normalizedSkillKey = normalizeSkillKey(skillKey)
    const [profile, skillDefinition] = await Promise.all([
      this.profiles.ensureDefaultAgentProfile({ ownerUserId }),
      this.resolveSkillDefinition(normalizedSkillKey),
    ])

    if (!skillDefinition) {
      throw new NotFoundException('技能不存在或尚未发布')
    }

    if (!skillDefinition.canInstall) {
      throw new ConflictException('该技能无需安装')
    }

    await this.prisma.$transaction(async (tx) => {
      const currentProfile = await tx.agentProfile.findFirst({
        where: {
          id: profile.id,
          ownerUserId,
          deletedAt: null,
        },
        select: {
          currentConfig: true,
        },
      })

      if (!currentProfile) {
        throw new NotFoundException('默认 AgentProfile 不存在')
      }

      const currentConfig = AgentProfileConfigSchema.parse(currentProfile.currentConfig)
      const nextConfig = installSkillBinding(currentConfig, skillDefinition)

      await tx.agentProfile.update({
        where: {
          id: profile.id,
        },
        data: {
          currentConfig: toJsonObject(nextConfig),
        },
      })
    })

    const response = await this.listDefaultAgentSkills(ownerUserId)
    const skill = response.skills.find(item => item.key === normalizedSkillKey)
    if (!skill) {
      throw new NotFoundException('技能不存在')
    }

    return MutateAgentSkillResponseSchema.parse({ skill })
  }

  async enableDefaultAgentSkill(ownerUserId: string, skillKey: string): Promise<MutateAgentSkillResponse> {
    return this.updateDefaultAgentSkillEnabled(ownerUserId, skillKey, true)
  }

  async disableDefaultAgentSkill(ownerUserId: string, skillKey: string): Promise<MutateAgentSkillResponse> {
    return this.updateDefaultAgentSkillEnabled(ownerUserId, skillKey, false)
  }

  async uninstallDefaultAgentSkill(ownerUserId: string, skillKey: string): Promise<MutateAgentSkillResponse> {
    const normalizedSkillKey = normalizeSkillKey(skillKey)
    const [profile, skillDefinition] = await Promise.all([
      this.profiles.ensureDefaultAgentProfile({ ownerUserId }),
      this.resolveSkillDefinition(normalizedSkillKey),
    ])

    if (!skillDefinition) {
      throw new NotFoundException('技能不存在或尚未发布')
    }

    if (!skillDefinition.canUninstall) {
      throw new ConflictException('该技能不可移除')
    }

    await this.prisma.$transaction(async (tx) => {
      const currentProfile = await tx.agentProfile.findFirst({
        where: {
          id: profile.id,
          ownerUserId,
          deletedAt: null,
        },
        select: {
          currentConfig: true,
        },
      })

      if (!currentProfile) {
        throw new NotFoundException('默认 AgentProfile 不存在')
      }

      const currentConfig = AgentProfileConfigSchema.parse(currentProfile.currentConfig)
      const nextConfig = removeSkillBinding(currentConfig, normalizedSkillKey)

      await tx.agentProfile.update({
        where: {
          id: profile.id,
        },
        data: {
          currentConfig: toJsonObject(nextConfig),
        },
      })
    })

    const response = await this.listDefaultAgentSkills(ownerUserId)
    const skill = response.skills.find(item => item.key === normalizedSkillKey)
    if (!skill) {
      throw new NotFoundException('技能不存在')
    }

    return MutateAgentSkillResponseSchema.parse({ skill })
  }

  private async updateDefaultAgentSkillEnabled(
    ownerUserId: string,
    skillKey: string,
    enabled: boolean,
  ): Promise<MutateAgentSkillResponse> {
    const normalizedSkillKey = normalizeSkillKey(skillKey)
    const [profile, skillDefinition] = await Promise.all([
      this.profiles.ensureDefaultAgentProfile({ ownerUserId }),
      this.resolveSkillDefinition(normalizedSkillKey),
    ])

    if (!skillDefinition) {
      throw new NotFoundException('技能不存在或尚未发布')
    }

    if (!enabled && !skillDefinition.canDisable) {
      throw new ConflictException('该技能不可关闭')
    }

    await this.prisma.$transaction(async (tx) => {
      const currentProfile = await tx.agentProfile.findFirst({
        where: {
          id: profile.id,
          ownerUserId,
          deletedAt: null,
        },
        select: {
          currentConfig: true,
        },
      })

      if (!currentProfile) {
        throw new NotFoundException('默认 AgentProfile 不存在')
      }

      const currentConfig = AgentProfileConfigSchema.parse(currentProfile.currentConfig)
      const nextConfig = setSkillBindingEnabled(currentConfig, skillDefinition, enabled)

      await tx.agentProfile.update({
        where: {
          id: profile.id,
        },
        data: {
          currentConfig: toJsonObject(nextConfig),
        },
      })
    })

    const response = await this.listDefaultAgentSkills(ownerUserId)
    const skill = response.skills.find(item => item.key === normalizedSkillKey)
    if (!skill) {
      throw new NotFoundException('技能不存在')
    }

    return MutateAgentSkillResponseSchema.parse({ skill })
  }

  async updateDefaultAgentSkillConfig(
    ownerUserId: string,
    skillKey: string,
    config: AgentSkillBindingConfig,
  ): Promise<UpdateAgentSkillConfigResponse> {
    const normalizedSkillKey = normalizeSkillKey(skillKey)
    const [profile, skillDefinition] = await Promise.all([
      this.profiles.ensureDefaultAgentProfile({ ownerUserId }),
      this.resolveSkillDefinition(normalizedSkillKey),
    ])

    if (!skillDefinition) {
      throw new NotFoundException('技能不存在或尚未发布')
    }

    const normalizedConfig = normalizeSkillBindingConfig(normalizedSkillKey, config)

    await this.prisma.$transaction(async (tx) => {
      const currentProfile = await tx.agentProfile.findFirst({
        where: {
          id: profile.id,
          ownerUserId,
          deletedAt: null,
        },
        select: {
          currentConfig: true,
        },
      })

      if (!currentProfile) {
        throw new NotFoundException('默认 AgentProfile 不存在')
      }

      const currentConfig = AgentProfileConfigSchema.parse(currentProfile.currentConfig)
      const nextConfig = updateSkillBindingConfig(currentConfig, skillDefinition, normalizedConfig)

      await tx.agentProfile.update({
        where: {
          id: profile.id,
        },
        data: {
          currentConfig: toJsonObject(nextConfig),
        },
      })
    })

    const response = await this.listDefaultAgentSkills(ownerUserId)
    const skill = response.skills.find(item => item.key === normalizedSkillKey)
    if (!skill) {
      throw new NotFoundException('技能不存在')
    }

    return UpdateAgentSkillConfigResponseSchema.parse({ skill })
  }

  async resolveRuntimeSkillContext(input: {
    actorUserId: string
    agentProfile: AgentProfileSnapshot
  }): Promise<AgentRuntimeSkillContext> {
    const agentProfile = AgentProfileSnapshotSchema.parse(input.agentProfile)
    const config = AgentProfileConfigSchema.parse(agentProfile.currentConfig)
    if (!config.toolPolicy.enabled || input.actorUserId !== agentProfile.ownerUserId) {
      return AgentRuntimeSkillContextSchema.parse({})
    }

    const enabledBindings = resolveRuntimeEnabledSkillBindings(config)
    const marketSkillKeys = enabledBindings
      .map(binding => binding.key)
      .filter(key => !builtInSkillByKey.has(key))

    const marketSkillByKey = new Map(
      (marketSkillKeys.length === 0 ? [] : await this.findActiveMarketSkills(marketSkillKeys))
        .map(skill => [skill.skillKey, skill]),
    )
    const availableSkills = enabledBindings
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((binding): AgentRuntimeSkillCatalogItem | null => {
        const builtIn = builtInSkillByKey.get(binding.key)
        if (builtIn) {
          return toBuiltInRuntimeCatalogItem(builtIn)
        }

        const skill = marketSkillByKey.get(binding.key)
        return skill ? toMarketRuntimeCatalogItem(skill) : null
      })
      .filter((item): item is AgentRuntimeSkillCatalogItem => Boolean(item))

    return AgentRuntimeSkillContextSchema.parse({ availableSkills })
  }

  async activateSkill(payload: ActivateAgentSkillRequest): Promise<ActivateAgentSkillResponse> {
    const snapshot = await this.resolveGenerationAgentProfileSnapshot(payload.actorUserId, payload.generationId)
    const skillKey = normalizeSkillKey(payload.skillKey)
    const binding = getEnabledSkillBinding(snapshot.currentConfig, skillKey)

    const builtIn = builtInSkillByKey.get(skillKey)
    if (builtIn) {
      return ActivateAgentSkillResponseSchema.parse({
        skill: {
          ...toBuiltInRuntimeCatalogItem(builtIn),
          instructions: renderBuiltInSkillInstructions(builtIn, binding),
          resources: [],
        },
      })
    }

    const skill = await this.findActiveMarketSkill(skillKey)
    if (!skill) {
      throw new NotFoundException('技能不存在或不可用')
    }

    return ActivateAgentSkillResponseSchema.parse({
      skill: {
        ...toMarketRuntimeCatalogItem(skill),
        instructions: skill.instructions,
        resources: skill.files.map(toSkillResourceFile),
      },
    })
  }

  async readSkillResource(payload: ReadAgentSkillResourceRequest): Promise<ReadAgentSkillResourceResponse> {
    const snapshot = await this.resolveGenerationAgentProfileSnapshot(payload.actorUserId, payload.generationId)
    const skillKey = normalizeSkillKey(payload.skillKey)
    getEnabledSkillBinding(snapshot.currentConfig, skillKey)

    if (builtInSkillByKey.has(skillKey)) {
      throw new NotFoundException('内置技能没有可读取资源')
    }

    const skill = await this.findActiveMarketSkill(skillKey)
    if (!skill) {
      throw new NotFoundException('技能不存在或不可用')
    }

    const resourcePath = normalizeResourcePath(payload.path)
    const file = skill.files.find(item => item.relPath === resourcePath)
    if (!file) {
      throw new NotFoundException('技能资源不存在')
    }

    const sizeBytes = toSafeFileSize(file.sizeBytes)
    if (sizeBytes > MAX_RESOURCE_BYTES) {
      throw new BadRequestException('技能资源超过读取上限')
    }

    const realRootPath = await realpath(skill.rootPath)
    const absolutePath = path.resolve(skill.rootPath, resourcePath)
    const realFilePath = await realpath(absolutePath)
    assertPathInside(realRootPath, realFilePath)

    const content = await readFile(realFilePath, 'utf8')

    return ReadAgentSkillResourceResponseSchema.parse({
      skillKey,
      path: resourcePath,
      content,
      sizeBytes,
      sha256: file.sha256,
    })
  }

  private async findActiveMarketSkills(skillKeys?: string[]): Promise<MarketSkill[]> {
    return this.prisma.agentSkill.findMany({
      where: {
        scope: 'MARKET',
        enabled: true,
        deletedAt: null,
        ...(skillKeys ? { skillKey: { in: skillKeys } } : {}),
      },
      select: marketSkillSelect,
      orderBy: [
        { name: 'asc' },
        { skillKey: 'asc' },
      ],
    })
  }

  private async findActiveMarketSkill(skillKey: string): Promise<MarketSkill | null> {
    return this.prisma.agentSkill.findFirst({
      where: {
        skillKey,
        scope: 'MARKET',
        enabled: true,
        deletedAt: null,
      },
      select: marketSkillSelect,
      orderBy: [
        { updatedAt: 'desc' },
      ],
    })
  }

  private async resolveSkillDefinition(skillKey: string): Promise<ResolvedSkillDefinition | null> {
    const builtIn = builtInSkillByKey.get(skillKey)
    if (builtIn) {
      return {
        key: builtIn.key,
        installMode: builtIn.installMode,
        defaultInstalled: builtIn.defaultInstalled,
        defaultEnabled: builtIn.defaultEnabled,
        canDisable: builtIn.canDisable,
        canUninstall: builtIn.canUninstall,
        configurable: builtIn.configurable,
        canInstall: builtIn.installMode === AGENT_SKILL_INSTALL_MODE.OPTIONAL,
      }
    }

    const marketSkill = await this.findActiveMarketSkill(skillKey)
    if (!marketSkill) {
      return null
    }

    return {
      key: marketSkill.skillKey,
      installMode: AGENT_SKILL_INSTALL_MODE.OPTIONAL,
      defaultInstalled: false,
      defaultEnabled: true,
      canDisable: true,
      canUninstall: true,
      configurable: false,
      canInstall: true,
    }
  }

  private async resolveGenerationAgentProfileSnapshot(actorUserId: string, generationId: string): Promise<AgentProfileSnapshot> {
    const generation = await this.prisma.chatMessageGeneration.findFirst({
      where: {
        generationId,
        actorUserId,
        deletedAt: null,
        status: {
          in: [
            ChatMessageGenerationStatus.PENDING,
            ChatMessageGenerationStatus.RUNNING,
          ],
        },
      },
      select: {
        agentProfileSnapshot: true,
      },
    })

    if (!generation) {
      throw new ConflictException('聊天生成不存在或已结束')
    }

    return AgentProfileSnapshotSchema.parse(generation.agentProfileSnapshot)
  }
}

function toBuiltInSkillCard(
  definition: (typeof AGENT_FIRST_PARTY_SKILL_DEFINITIONS)[number],
  binding: AgentSkillBinding | undefined,
): AgentSkillCard {
  const installed = definition.defaultInstalled || Boolean(binding)
  const enabled = installed
    ? definition.canDisable
      ? binding?.enabled ?? definition.defaultEnabled
      : definition.defaultEnabled
    : false

  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    activationMode: definition.activationMode,
    riskLevel: definition.riskLevel,
    builtIn: true,
    installMode: definition.installMode,
    defaultInstalled: definition.defaultInstalled,
    defaultEnabled: definition.defaultEnabled,
    configurable: definition.configurable,
    tools: definition.tools,
    installed,
    enabled,
    canInstall: !installed && definition.installMode === AGENT_SKILL_INSTALL_MODE.OPTIONAL,
    canEnable: installed && !enabled,
    canDisable: installed && enabled && definition.canDisable,
    canUninstall: installed && definition.canUninstall,
    canConfigure: installed && definition.configurable,
    config: normalizeSkillBindingConfig(definition.key, binding?.config ?? getDefaultSkillBindingConfig(definition.key)),
    sourceScope: AGENT_SKILL_SOURCE_SCOPE.BUILTIN,
    resourceCount: 0,
    scriptExecutionEnabled: false,
  }
}

function toMarketSkillCard(
  skill: MarketSkill,
  binding: AgentSkillBinding | undefined,
): AgentSkillCard {
  const installed = Boolean(binding)
  const enabled = binding?.enabled ?? false

  return {
    key: skill.skillKey,
    name: skill.name,
    description: skill.description,
    category: parseSkillCategory(skill.category),
    activationMode: AGENT_SKILL_ACTIVATION_MODE.MODEL_SELECTED,
    riskLevel: parseSkillRiskLevel(skill.riskLevel),
    builtIn: false,
    installMode: AGENT_SKILL_INSTALL_MODE.OPTIONAL,
    defaultInstalled: false,
    defaultEnabled: true,
    configurable: false,
    tools: [],
    installed,
    enabled,
    canInstall: !installed,
    canEnable: installed && !enabled,
    canDisable: installed && enabled,
    canUninstall: installed,
    canConfigure: false,
    config: binding?.config ?? {},
    sourceScope: AGENT_SKILL_SOURCE_SCOPE.EXTERNAL,
    resourceCount: skill.files.length,
    scriptExecutionEnabled: SCRIPT_EXECUTION_ENABLED,
  }
}

function toBuiltInRuntimeCatalogItem(
  definition: (typeof AGENT_FIRST_PARTY_SKILL_DEFINITIONS)[number],
): AgentRuntimeSkillCatalogItem {
  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    activationMode: definition.activationMode,
    sourceScope: AGENT_SKILL_SOURCE_SCOPE.BUILTIN,
    builtIn: true,
    tools: definition.tools,
  }
}

function toMarketRuntimeCatalogItem(skill: MarketSkill): AgentRuntimeSkillCatalogItem {
  return {
    key: skill.skillKey,
    name: skill.name,
    description: skill.description,
    activationMode: AGENT_SKILL_ACTIVATION_MODE.MODEL_SELECTED,
    sourceScope: AGENT_SKILL_SOURCE_SCOPE.EXTERNAL,
    builtIn: false,
    tools: [],
  }
}

function toSkillResourceFile(file: SkillFileRecord): AgentSkillResourceFile {
  return {
    path: file.relPath,
    sizeBytes: toSafeFileSize(file.sizeBytes),
    sha256: file.sha256,
    executable: file.executable,
  }
}

function parseSkillCategory(value: string): AgentSkillCategory {
  const result = AgentSkillCategorySchema.safeParse(value)
  return result.success ? result.data : AGENT_SKILL_CATEGORY.PRODUCTIVITY
}

function parseSkillRiskLevel(value: string): AgentSkillRiskLevel {
  const result = AgentSkillRiskLevelSchema.safeParse(value)
  return result.success ? result.data : AGENT_SKILL_RISK_LEVEL.LOW
}

function installSkillBinding(
  config: AgentProfileConfig,
  skill: ResolvedSkillDefinition,
): AgentProfileConfig {
  const existing = config.skillBindings.find(binding => binding.key === skill.key)
  const maxPriority = config.skillBindings.reduce((max, binding) => Math.max(max, binding.priority), -1)
  const normalizedConfig = normalizeSkillBindingConfig(skill.key, existing?.config ?? getDefaultSkillBindingConfig(skill.key))
  const skillBindings = existing
    ? config.skillBindings.map(binding =>
        binding.key === skill.key
          ? { ...binding, enabled: skill.defaultEnabled, config: normalizedConfig }
          : binding,
      )
    : [
        ...config.skillBindings,
        {
          key: skill.key,
          enabled: skill.defaultEnabled,
          priority: maxPriority + 1,
          config: normalizedConfig,
        },
      ]

  return AgentProfileConfigSchema.parse({
    ...config,
    toolPolicy: {
      ...config.toolPolicy,
      enabled: true,
    },
    skillBindings,
  })
}

function setSkillBindingEnabled(
  config: AgentProfileConfig,
  skill: ResolvedSkillDefinition,
  enabled: boolean,
): AgentProfileConfig {
  const existing = config.skillBindings.find(binding => binding.key === skill.key)
  if (!existing && skill.installMode === AGENT_SKILL_INSTALL_MODE.OPTIONAL) {
    throw new ConflictException('技能尚未安装')
  }

  if (!existing) {
    return installSkillBinding(config, { ...skill, defaultEnabled: enabled })
  }

  return AgentProfileConfigSchema.parse({
    ...config,
    toolPolicy: {
      ...config.toolPolicy,
      enabled: true,
    },
    skillBindings: config.skillBindings.map(binding =>
      binding.key === skill.key
        ? { ...binding, enabled, config: normalizeSkillBindingConfig(skill.key, binding.config) }
        : binding,
    ),
  })
}

function updateSkillBindingConfig(
  config: AgentProfileConfig,
  skill: ResolvedSkillDefinition,
  nextBindingConfig: AgentSkillBindingConfig,
): AgentProfileConfig {
  if (!skill.configurable) {
    throw new ConflictException('技能不支持配置')
  }

  const existing = config.skillBindings.find(binding => binding.key === skill.key)
  if (!existing && skill.installMode === AGENT_SKILL_INSTALL_MODE.OPTIONAL) {
    throw new ConflictException('技能尚未安装')
  }

  const normalizedConfig = normalizeSkillBindingConfig(skill.key, nextBindingConfig)
  const skillBindings = existing
    ? config.skillBindings.map(binding =>
        binding.key === skill.key
          ? { ...binding, config: normalizedConfig }
          : binding,
      )
    : [
        ...config.skillBindings,
        {
          key: skill.key,
          enabled: skill.defaultEnabled,
          priority: config.skillBindings.reduce((max, binding) => Math.max(max, binding.priority), -1) + 1,
          config: normalizedConfig,
        },
      ]

  return AgentProfileConfigSchema.parse({
    ...config,
    toolPolicy: {
      ...config.toolPolicy,
      enabled: true,
    },
    skillBindings,
  })
}

function removeSkillBinding(config: AgentProfileConfig, skillKey: string): AgentProfileConfig {
  return AgentProfileConfigSchema.parse({
    ...config,
    skillBindings: config.skillBindings.filter(binding => binding.key !== skillKey),
  })
}

function getEnabledSkillBinding(config: AgentProfileConfig, skillKey: string): AgentSkillBinding {
  if (!config.toolPolicy.enabled) {
    throw new ConflictException('当前 AgentProfile 未启用工具')
  }

  const binding = resolveRuntimeEnabledSkillBindings(config).find(item => item.key === skillKey)
  if (!binding) {
    throw new NotFoundException('技能未启用')
  }

  return binding
}

function resolveRuntimeEnabledSkillBindings(config: AgentProfileConfig): AgentSkillBinding[] {
  if (!config.toolPolicy.enabled) {
    return []
  }

  const skillBindings = config.skillBindings.map((binding) => {
    const definition = builtInSkillByKey.get(binding.key)
    if (!definition) {
      return binding
    }

    return {
      ...binding,
      enabled: !definition.canDisable && definition.defaultEnabled ? true : binding.enabled,
      config: normalizeSkillBindingConfig(binding.key, binding.config),
    }
  })
  const existingSkillKeys = new Set(skillBindings.map(binding => binding.key))

  for (const definition of AGENT_FIRST_PARTY_SKILL_DEFINITIONS) {
    if (existingSkillKeys.has(definition.key)) {
      continue
    }

    if (!definition.defaultInstalled || !definition.defaultEnabled) {
      continue
    }

    skillBindings.push({
      key: definition.key,
      enabled: true,
      priority: 0,
      config: getDefaultSkillBindingConfig(definition.key),
    })
  }

  return AgentProfileConfigSchema.parse({
    ...config,
    skillBindings,
  }).skillBindings.filter(binding => binding.enabled)
}

function normalizeSkillBindingConfig(skillKey: string, config: unknown): AgentSkillBindingConfig {
  const handler = getBuiltInSkillConfigHandler(skillKey)

  return handler
    ? handler.normalize(config)
    : AgentSkillBindingConfigSchema.parse(config)
}

function normalizeTranslatorSkillConfig(config: unknown): AgentSkillBindingConfig {
  const result = AgentTranslatorSkillConfigSchema.safeParse(config)
  if (result.success) {
    return result.data
  }

  if (!isRecord(config)) {
    return AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG
  }

  const cleanedResult = AgentTranslatorSkillConfigSchema.safeParse({
    preserveFormatting: config.preserveFormatting,
    outputMode: config.outputMode,
    formality: config.formality,
  })

  return cleanedResult.success ? cleanedResult.data : AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG
}

function normalizeTimeSkillConfig(config: unknown): AgentSkillBindingConfig {
  const result = AgentTimeSkillConfigSchema.safeParse(config)
  if (result.success) {
    return result.data
  }

  if (!isRecord(config)) {
    return AgentTimeSkillConfigSchema.parse({})
  }

  const cleanedResult = AgentTimeSkillConfigSchema.safeParse({
    timeZone: config.timeZone,
  })

  return cleanedResult.success ? cleanedResult.data : AgentTimeSkillConfigSchema.parse({})
}

function normalizeLocationSkillConfig(config: unknown): AgentSkillBindingConfig {
  const result = AgentLocationSkillConfigSchema.safeParse(config)
  if (result.success) {
    return result.data
  }

  if (!isRecord(config)) {
    return AgentLocationSkillConfigSchema.parse({})
  }

  const cleanedResult = AgentLocationSkillConfigSchema.safeParse({
    mode: config.mode,
    fixedLocation: config.fixedLocation,
  })

  return cleanedResult.success ? cleanedResult.data : AgentLocationSkillConfigSchema.parse({})
}

function normalizeWebSearchSkillConfig(config: unknown): AgentSkillBindingConfig {
  const result = AgentWebSearchSkillConfigSchema.safeParse(config)
  if (result.success) {
    return result.data
  }

  if (!isRecord(config)) {
    return AgentWebSearchSkillConfigSchema.parse({})
  }

  const cleanedResult = AgentWebSearchSkillConfigSchema.safeParse({
    providers: config.providers,
    maxResults: config.maxResults,
    searchContextSize: config.searchContextSize,
    allowedDomains: config.allowedDomains,
    blockedDomains: config.blockedDomains,
  })

  return cleanedResult.success ? cleanedResult.data : AgentWebSearchSkillConfigSchema.parse({})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getDefaultSkillBindingConfig(skillKey: string): AgentSkillBindingConfig {
  const handler = getBuiltInSkillConfigHandler(skillKey)

  return handler ? handler.defaultConfig() : {}
}

function renderBuiltInSkillInstructions(
  definition: (typeof AGENT_FIRST_PARTY_SKILL_DEFINITIONS)[number],
  binding: AgentSkillBinding,
): string {
  const handler = getBuiltInSkillConfigHandler(definition.key)

  return handler?.renderInstructions?.(definition, binding) ?? definition.instructions
}

function renderTranslatorRuntimeInstructions(
  definition: (typeof AGENT_FIRST_PARTY_SKILL_DEFINITIONS)[number],
  binding: AgentSkillBinding,
): string {
  const config = AgentTranslatorSkillConfigSchema.parse(binding.config)

  return [
    definition.instructions,
    '',
    '<translator_runtime_config>',
    'sourceLanguage: auto',
    'targetLanguage: provided by current user invocation',
    'sameLanguageInput: translate naturally to the selected target language without asking for a separate policy.',
    `preserveFormatting: ${config.preserveFormatting ? 'true' : 'false'}`,
    `outputMode: ${formatTranslatorOutputMode(config.outputMode)}`,
    `formality: ${config.formality}`,
    '</translator_runtime_config>',
    '',
    'If the current user request does not explicitly name a target language, use the target language selected in the current invocation.',
  ].join('\n')
}

function renderWebSearchRuntimeInstructions(
  definition: (typeof AGENT_FIRST_PARTY_SKILL_DEFINITIONS)[number],
  binding: AgentSkillBinding,
): string {
  const config = AgentWebSearchSkillConfigSchema.parse(binding.config)

  return [
    definition.instructions,
    '',
    '<web_search_runtime_config>',
    `providers: ${config.providers.join(', ')}`,
    `maxResults: ${config.maxResults}`,
    `searchContextSize: ${config.searchContextSize}`,
    `allowedDomains: ${config.allowedDomains.length > 0 ? config.allowedDomains.join(', ') : 'any'}`,
    `blockedDomains: ${config.blockedDomains.length > 0 ? config.blockedDomains.join(', ') : 'none'}`,
    '</web_search_runtime_config>',
  ].join('\n')
}

function getBuiltInSkillConfigHandler(skillKey: string): BuiltInSkillConfigHandler | undefined {
  return builtInSkillConfigHandlerByKey[skillKey as keyof typeof builtInSkillConfigHandlerByKey]
}

function formatTranslatorOutputMode(mode: string): string {
  if (mode === AGENT_TRANSLATOR_OUTPUT_MODE.BILINGUAL) {
    return 'bilingual'
  }

  if (mode === AGENT_TRANSLATOR_OUTPUT_MODE.WITH_NOTES) {
    return 'translation with brief notes'
  }

  return 'translation only'
}

function normalizeSkillKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeResourcePath(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  if (normalized.startsWith('/') || parts.length === 0 || parts.some(part => part === '..' || part === '.')) {
    throw new BadRequestException('技能资源路径不合法')
  }

  return parts.join('/')
}

function toSafeFileSize(value: bigint): number {
  const size = Number(value)
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new BadRequestException('技能资源大小不合法')
  }

  return size
}

function assertPathInside(basePath: string, targetPath: string): void {
  const prefix = basePath.endsWith(path.sep) ? basePath : `${basePath}${path.sep}`
  if (targetPath !== basePath && !targetPath.startsWith(prefix)) {
    throw new BadRequestException('技能资源路径越界')
  }
}

function toJsonObject(value: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
}
