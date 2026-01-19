import { ZodObject, z } from 'zod/v4'
import { GlobalConfig } from './config'
import { Logger } from './logger'

/*
 ** The context object passed to plugins during execution
 */
export type PluginContext = {
  /*
   ** The current date for which the workflow is being executed
   */
  date: Date
  /*
   ** The global configuration object
   */
  config: GlobalConfig

  /*
   ** Logger instance for logging within plugins
   */
  logger: Logger
}

export type PluginRetrieveContext = PluginContext & {
  aiSummarizer: (prompt: string) => Promise<string>
}

/*
 ** The result returned by an input plugin after retrieving data
 */
export type PluginSummaryResult = {
  pluginName: string
  summary: string
  metadata?: Record<string, unknown>
}

/**
 ** The final summary result after formatting
 */
export type SummaryResult = {
  header?: string
  content: string
}

/**
 ** The main Plugin type definition
 */
export type Plugin<TConfig extends z.ZodTypeAny> = {
  name: string
  configSchema: TConfig
  parseConfig: (rawConfig: unknown) => z.infer<TConfig>
  description?: string

  /**
   * Retrieve data and returns the summary
   * @param ctx
   * @param config
   */
  retrieve?(ctx: PluginRetrieveContext, config: z.infer<TConfig>): Promise<PluginSummaryResult>

  /**
   * Formats the final summary output (e.g., Markdown, HTML)
   * @param ctx
   * @param summaries
   * @param config
   */

  format?(
    ctx: PluginContext,
    summaries: PluginSummaryResult[],
    config: z.infer<TConfig>,
  ): Promise<SummaryResult>

  /**
   * Outputs the final summary to the destination
   * @param ctx
   * @param summary
   * @param config
   */
  output?(ctx: PluginContext, summary: SummaryResult, config: z.infer<TConfig>): Promise<void>
}

export type FormatterPlugin = Plugin<z.ZodTypeAny> & {
  format: NonNullable<Plugin<z.ZodTypeAny>['format']>
}

export type InputPlugin = Plugin<z.ZodTypeAny> & {
  retrieve: NonNullable<Plugin<z.ZodTypeAny>['retrieve']>
}

export type OutputPlugin = Plugin<z.ZodTypeAny> & {
  output: NonNullable<Plugin<z.ZodTypeAny>['output']>
}

/**
 ** The instance of a plugin as defined in a workflow YAML
 */
export type PluginInstance<TConfig extends ZodObject> = {
  plugin: string
  enabled?: boolean
  config: TConfig
}
