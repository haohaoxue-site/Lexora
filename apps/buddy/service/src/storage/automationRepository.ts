import type { DatabaseSync } from 'node:sqlite'
import type { AutomationDefinitionCommandRepository } from './automationDefinitionCommandRepository'
import type { AutomationDefinitionIndexRepository } from './automationDefinitionIndexRepository'
import type { AutomationMutationReplayRepository } from './automationMutationStore'
import type { AutomationOccurrenceCommandRepository } from './automationOccurrenceCommandRepository'
import type { AutomationOccurrenceIndexRepository } from './automationOccurrenceIndexRepository'
import type { AutomationOccurrenceTransactionRepository } from './automationOccurrenceTransactionRepository'
import { createAutomationDefinitionCommandStore } from './automationDefinitionCommandRepository'
import { createAutomationDefinitionIndexStore } from './automationDefinitionIndexRepository'
import { createAutomationMutationStore } from './automationMutationStore'
import { createAutomationOccurrenceCommandStore } from './automationOccurrenceCommandRepository'
import { createAutomationOccurrenceIndexStore } from './automationOccurrenceIndexRepository'
import { createAutomationOccurrenceTransactionRepository } from './automationOccurrenceTransactionRepository'

export type AutomationDefinitionRepository
  = AutomationDefinitionCommandRepository & AutomationDefinitionIndexRepository

export type AutomationOccurrenceRepository
  = AutomationOccurrenceCommandRepository
    & AutomationOccurrenceIndexRepository
    & AutomationOccurrenceTransactionRepository

export interface AutomationRepositories {
  definitions: AutomationDefinitionRepository
  mutations: AutomationMutationReplayRepository
  occurrences: AutomationOccurrenceRepository
}

export function createAutomationRepositories(database: DatabaseSync): AutomationRepositories {
  const definitions = createAutomationDefinitionIndexStore(database)
  const mutations = createAutomationMutationStore(database)
  const definitionCommands = createAutomationDefinitionCommandStore(
    database,
    definitions,
    mutations,
  )
  const occurrences = createAutomationOccurrenceIndexStore(database)
  const occurrenceCommands = createAutomationOccurrenceCommandStore(
    database,
    occurrences,
  )
  const occurrenceTransactions = createAutomationOccurrenceTransactionRepository({
    database,
    definitionCommands,
    definitions,
    mutations,
    occurrenceCommands,
    occurrences,
  })

  return {
    definitions: {
      ...definitionCommands.repository,
      ...definitions.repository,
    },
    mutations: mutations.repository,
    occurrences: {
      ...occurrenceCommands.repository,
      ...occurrences.repository,
      ...occurrenceTransactions,
    },
  }
}
