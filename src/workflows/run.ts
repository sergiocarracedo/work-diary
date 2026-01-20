import {
  getPluginRegistry,
  isFormatterPlugin,
  isInputPlugin,
  isOutputPlugin,
} from '@/plugins/autoload'
import { AIService } from '@/services/ai'
import type { PluginContext, PluginSummaryResult } from '@/types'
import { logger } from '@/utils/logger'
import type { Config } from './schema'

export interface RunWorkflowOptions {
  workflowFile: string
}

export async function runWorkflow(date: Date, config: Config): Promise<void> {
  const registry = await getPluginRegistry()

  const ai = new AIService(config.ai, logger)
  const ctx: PluginContext = {
    date,
    config: { dateFormat: config.dateFormat ?? 'YYYY-MM-DD' },
    logger,
  }

  /*
   * Retrieve data from input plugins
   */
  const summarizedResults = await Promise.allSettled(
    config.inputs.map(async (input) => {
      if (!input.enabled) {
        return
      }
      const plugin = registry.get(input.plugin)
      if (!isInputPlugin(plugin)) {
        throw new Error(`Plugin ${input.plugin} does not implement a input capability`)
      }

      const parsedConfig = plugin.parseConfig(input.config ?? {})

      logger.info(`Retrieving data: ${input.id} (${input.plugin})`)

      const result = await plugin.retrieve(
        {
          ...ctx,
          aiSummarizer: (prompt: string) => ai.generate(input.plugin, prompt, 0.7),
        },
        parsedConfig,
      )

      return { id: input.id, plugin, config: parsedConfig, summaryResult: result }
    }),
  )

  const inputsSummaries: PluginSummaryResult[] = []
  for (const res of summarizedResults) {
    if (res.status === 'fulfilled' && res.value) {
      inputsSummaries.push(res.value.summaryResult)
    } else if (res.status === 'rejected') {
      logger.error(`Error during input retrieval: ${res.reason}`)
    }
  }

  /*
   * Format the plugin summaries for output plugins
   */

  const formatterPlugin = registry.get(config.formatter.plugin)

  if (!isFormatterPlugin(formatterPlugin)) {
    throw new Error(`Plugin ${config.formatter.plugin} does not implement a formatter capability`)
  }

  const formatterConfig = formatterPlugin.parseConfig(config.formatter.config ?? {})

  const output = await formatterPlugin.format(ctx, inputsSummaries, formatterConfig)

  await Promise.allSettled(
    config.outputs.map(async (outputPlugin) => {
      if (!outputPlugin.enabled) {
        return
      }
      const plugin = registry.get(outputPlugin.plugin)
      if (!isOutputPlugin(plugin)) {
        throw new Error(`Plugin ${outputPlugin.plugin} does not implement a output capability`)
      }

      const parsedConfig = plugin.parseConfig(outputPlugin.config ?? {})
      logger.info(`Writing output: ${outputPlugin.plugin}`)
      await plugin.output(ctx, output, parsedConfig)
    }),
  )
}
