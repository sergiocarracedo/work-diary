#!/usr/bin/env node

import { logger } from '@/utils/logger'
import { Command } from 'commander'
import dotenv from 'dotenv'
import path from 'node:path'
import process from 'node:process'
import { runWorkflow } from './workflows/run'
import { ConfigSchema } from './workflows/schema'

// Load environment variables early
dotenv.config()

type CliOptions = {
  config: string
  date?: string
  debug?: boolean
}

const resolveEnvPlaceholders = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const envMatch = value.match(/^env:([A-Z0-9_]+)$/i)

    if (envMatch && envMatch[1]) {
      const envVar = envMatch[1]
      const envValue = process.env[envVar]

      if (envValue === undefined) {
        logger.error(`Environment variable ${envVar} is not set`)
      }

      return envValue
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map(resolveEnvPlaceholders)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, resolveEnvPlaceholders(val)]),
    )
  }

  return value
}

const getConfig = async (configPath: string) => {
  const fs = await import('node:fs/promises')
  const yaml = await import('yaml')

  const configContent = await fs.readFile(configPath, 'utf-8')
  const configData = yaml.parse(configContent)
  const resolvedConfigData = resolveEnvPlaceholders(configData)
  const config = ConfigSchema.parse(resolvedConfigData)

  return config
}

async function main(): Promise<void> {
  try {
    const program = new Command()
      .name('workdiary')
      .description('Generate a daily work diary from configured plugins')
      .option('-c, --config <path>', 'Path to config file', 'workdiary.config.yaml')
      .option('-d, --date <date>', 'Date to summarize (YYYY-MM-DD)')
      .option('--debug', 'Enable verbose debug logging', false)

    const options = program.parse(process.argv).opts<CliOptions>()

    if (options.debug) {
      process.env.DEBUG = '1'
      logger.debug('Debug logging enabled')
    }

    const config = await getConfig(path.resolve(process.cwd(), options.config))

    if (!options.date) {
      logger.info('No date specified, using current date')
    }

    await runWorkflow(options.date ? new Date(options.date) : new Date(), config)
  } catch (error) {
    console.log(error)
    logger.error(`Workflow failed: ${error}`)
    process.exit(1)
  }
}

void main()
