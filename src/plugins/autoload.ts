import { Logger } from '@/types'
import type { FormatterPlugin, InputPlugin, OutputPlugin, Plugin } from '@/types/plugins'
import { logger } from '@/utils/logger'
import type { z } from 'zod/v4'

type AnyPlugin = Plugin<z.ZodTypeAny>

type PluginModule = { default?: AnyPlugin }

const pluginCapabilities = ['input', 'formatter', 'output'] as const
type PluginCapability = (typeof pluginCapabilities)[number]

type PluginEntry = {
  capabilities: PluginCapability[]
  plugin: AnyPlugin
}

export class PluginRegistry {
  private plugins = new Map<string, PluginEntry>()

  constructor(private logger: Logger) {}
  async init() {
    await this.loadPlugins()
  }

  private isPluginLike(maybe: unknown): maybe is AnyPlugin {
    if (!maybe || typeof maybe !== 'object') {
      return false
    }
    return (
      typeof (maybe as Partial<AnyPlugin>).name === 'string' &&
      Boolean((maybe as Partial<AnyPlugin>).configSchema) &&
      typeof (maybe as Partial<AnyPlugin>).parseConfig === 'function'
    )
  }

  private async loadPlugins(): Promise<void> {
    const modules = import.meta.glob<PluginModule>(
      ['./**/*.{ts,tsx,js,mjs,cjs}', '!./**/*.test.*', '!./**/*.spec.*'],
      { eager: true },
    )

    this.logger.info(`Loading plugins from bundle: ${Object.keys(modules).length} candidates`)

    for (const [file, mod] of Object.entries(modules)) {
      if (/\.(test|spec)\.[^.]+$/.test(file)) {
        this.logger.debug(`Skipping test module: ${file}`)
        continue
      }

      const plugin = mod?.default
      if (this.isPluginLike(plugin)) {
        const pluginEntry: PluginEntry = this.register(plugin)
        this.logger.info(
          `Loaded plugin: ${pluginEntry.plugin.name}, capabilities: ${pluginEntry.capabilities.join(', ')}`,
        )
        continue
      }

      this.logger.debug(`Skipping non-plugin module: ${file}`)
    }
  }

  private getPluginCapabilities(plugin: AnyPlugin): PluginCapability[] {
    const capabilities: PluginCapability[] = []
    if (plugin.retrieve) {
      capabilities.push('input' as const)
    }
    if (plugin.format) {
      capabilities.push('formatter' as const)
    }
    if (plugin.output) {
      capabilities.push('output' as const)
    }
    return capabilities
  }
  register(plugin: AnyPlugin): PluginEntry {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`)
    }

    const entry: PluginEntry = {
      capabilities: this.getPluginCapabilities(plugin),
      plugin,
    }
    this.plugins.set(plugin.name, entry)
    return entry
  }

  checkHaveCapability(name: string, capability: PluginCapability): boolean {
    const entry = this.plugins.get(name)
    if (!entry) {
      throw new Error(`Unknown plugin: ${name}`)
    }
    return entry.capabilities.includes(capability)
  }

  get(name: string): AnyPlugin {
    const plugin = this.plugins.get(name)

    if (!plugin) {
      throw new Error(`Unknown plugin: ${name}`)
    }
    return plugin.plugin
  }
}

/** Singleton instance */
let registryInstance: PluginRegistry | null = null
export const getPluginRegistry = async (): Promise<PluginRegistry> => {
  if (registryInstance) {
    return registryInstance
  }

  const registry = new PluginRegistry(logger)
  await registry.init()
  registryInstance = registry
  return registry
}

export const isInputPlugin = (plugin: unknown): plugin is InputPlugin => {
  return (
    !!plugin &&
    typeof plugin === 'object' &&
    typeof (plugin as Partial<{ retrieve: unknown }>).retrieve === 'function'
  )
}

export const isFormatterPlugin = (plugin: unknown): plugin is FormatterPlugin => {
  return (
    !!plugin &&
    typeof plugin === 'object' &&
    typeof (plugin as Partial<{ format: unknown }>).format === 'function'
  )
}

export const isOutputPlugin = (plugin: unknown): plugin is OutputPlugin => {
  return (
    !!plugin &&
    typeof plugin === 'object' &&
    typeof (plugin as Partial<{ output: unknown }>).output === 'function'
  )
}
