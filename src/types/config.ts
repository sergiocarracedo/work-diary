import { z } from 'zod/v4'

export type AIProvider = 'openai' | 'anthropic' | 'google'

export type GlobalConfig = {
  dateFormat?: string
}

export const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google']),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(1).optional().default(0.7),
})

export type AiConfig = z.infer<typeof aiConfigSchema>
