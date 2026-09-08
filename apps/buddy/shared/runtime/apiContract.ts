import type { z } from 'zod'

export interface RuntimeRequestContract {
  readonly method: string
  readonly input: z.ZodType
  readonly response: z.ZodType
}

export type RuntimeRequestInput<Contract extends RuntimeRequestContract> = z.input<Contract['input']>
export type RuntimeRequestResult<Contract extends RuntimeRequestContract> = z.output<Contract['response']>

export interface RuntimeNotificationContract {
  readonly method: string
  readonly params: z.ZodType
}
