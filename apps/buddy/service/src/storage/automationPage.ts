export interface AutomationCursor {
  id: string
  occurredAt: string
}

export interface AutomationPageRecord<T> {
  items: T[]
  nextCursor: AutomationCursor | null
}
