import { aiConfigSchema } from '@/types'
import { z } from 'zod/v4'

export const PluginInstanceSchema = z.object({
  id: z.string().min(1).optional(),
  plugin: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  config: z.unknown().optional(),
})

export const ConfigSchema = z.object({
  ai: aiConfigSchema,
  inputs: z.array(PluginInstanceSchema).min(1),
  formatter: z.object({
    plugin: z.string().min(1),
    config: z.unknown().optional(),
  }),
  outputs: z.array(PluginInstanceSchema).min(1),
  dateFormat: z.string().optional(),
})

export type Config = z.infer<typeof ConfigSchema>
export type PluginInstance = z.infer<typeof PluginInstanceSchema>
