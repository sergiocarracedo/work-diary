import { Logger } from '@/types'
import type { FormatterPlugin, InputPlugin, OutputPlugin, Plugin } from '@/types/plugins'
import { logger } from '@/utils/logger'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { z } from 'zod/v4'

const pluginFileExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])

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

  private async loadPlugins(): Promise<Record<string, PluginEntry>> {
    const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

    const collectPluginFiles = async (dir: string): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const files: string[] = []

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          files.push(...(await collectPluginFiles(fullPath)))
          continue
        }
        if (pluginFileExtensions.has(path.extname(entry.name))) {
          files.push(fullPath)
        }
      }

      return files
    }

    this.logger.info(`Loading plugins from filesystem: ${baseDir}`)
    const files = await collectPluginFiles(baseDir)
    const registry: Record<string, PluginEntry> = {}

    for (const file of files) {
      const mod = (await import(pathToFileURL(file).href)) as PluginModule
      const plugin = mod?.default
      if (this.isPluginLike(plugin)) {
        const pluginEntry: PluginEntry = this.register(plugin)

        this.logger.info(
          `Loaded plugin: ${pluginEntry.plugin.name}, capabilities: ${pluginEntry.capabilities.join(', ')}`,
        )
      }
    }

    return registry
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
