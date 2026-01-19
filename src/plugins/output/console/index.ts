import { createPluginConfigParser } from '@/plugins/config'
import { Plugin, PluginContext, SummaryResult } from '@/types/plugins'
import { z } from 'zod/v4'

const consoleConfigSchema = z.object({})

export type ConsoleConfig = z.infer<typeof consoleConfigSchema>

const ConsolePlugin: Plugin<typeof consoleConfigSchema> = {
  name: 'console',
  configSchema: consoleConfigSchema,
  parseConfig: createPluginConfigParser('console', consoleConfigSchema),
  description: 'Logs the daily summary to the console.',
  output: async (_ctx: PluginContext, summary: SummaryResult, _config: ConsoleConfig) => {
    console.log(summary.content)
  },
}

export default ConsolePlugin
