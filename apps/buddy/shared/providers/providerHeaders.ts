import { z } from 'zod'

export const providerHeaderNameSchema = z.string().trim().min(1).max(128).regex(/^[!#$%&'*+.^`|~\w-]+$/)
export const providerHeaderValueSchema = z.string().max(8192).regex(/^[\t\x20-\x7E\x80-\xFF]*$/)
export const providerRequestHeaderSchema = z.object({
  name: providerHeaderNameSchema,
  value: providerHeaderValueSchema,
}).strict()

export const providerRequestHeadersSchema = z.array(providerRequestHeaderSchema).max(32).superRefine((headers, context) => {
  const names = new Set<string>()
  headers.forEach((header, index) => {
    const name = header.name.toLowerCase()
    if (names.has(name))
      context.addIssue({ code: 'custom', message: 'Duplicate header name', path: [index, 'name'] })
    names.add(name)
  })
})

export type ProviderRequestHeader = z.infer<typeof providerRequestHeaderSchema>
