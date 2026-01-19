import { createPluginConfigParser } from '@/plugins/config'
import { Plugin } from '@/types/plugins'
import { formatDate } from '@/utils/date'
import { DEFAULT_END_MARKER, DEFAULT_START_MARKER } from '@/utils/markers'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod/v4'

const fileOutputConfigSchema = z.object({
  path: z.string().min(1),
  mode: z.enum(['replace', 'merge']).default('merge'),
  startMarker: z.string().default(DEFAULT_START_MARKER),
  endMarker: z.string().default(DEFAULT_END_MARKER),
})

export type FileOutputConfig = z.infer<typeof fileOutputConfigSchema>

type MarkedBlock = {
  block: string
  startIndex: number
  endIndex: number
}

const ensureDirectory = async (filePath: string) => {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

const expandTilde = (filePath: string): string => {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1))
  }
  return filePath
}

const resolveTargetPath = (template: string, date: Date): string => {
  const rendered = template.replaceAll('{date}', formatDate(date))
  const expanded = expandTilde(rendered)
  return path.resolve(expanded)
}

const extractMarkedBlock = (
  content: string,
  startMarker: string,
  endMarker: string,
): MarkedBlock | null => {
  const startIndex = content.indexOf(startMarker)
  if (startIndex === -1) return null

  const endIndex = content.indexOf(endMarker, startIndex + startMarker.length)
  if (endIndex === -1) return null

  const endExclusive = endIndex + endMarker.length
  return {
    block: content.slice(startIndex, endExclusive),
    startIndex,
    endIndex: endExclusive,
  }
}

const mergeWithMarkers = (
  existingContent: string,
  newContent: string,
  startMarker: string,
  endMarker: string,
): string => {
  const newBlock = extractMarkedBlock(newContent, startMarker, endMarker)

  if (!newBlock) {
    return newContent
  }

  const existingBlock = extractMarkedBlock(existingContent, startMarker, endMarker)

  if (!existingBlock) {
    const separator = existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n\n' : ''
    return `${existingContent}${separator}${newBlock.block}`
  }

  return (
    existingContent.slice(0, existingBlock.startIndex) +
    newBlock.block +
    existingContent.slice(existingBlock.endIndex)
  )
}

const FileOutputPlugin: Plugin<typeof fileOutputConfigSchema> = {
  name: 'file',
  configSchema: fileOutputConfigSchema,
  parseConfig: createPluginConfigParser('file', fileOutputConfigSchema),
  description: 'Writes the daily summary to a file (supports {date} in path) with optional merge.',
  output: async (ctx, summary, config) => {
    const targetPath = resolveTargetPath(config.path, ctx.date)
    await ensureDirectory(targetPath)

    ctx.logger.info(`Writing summary to file: ${targetPath}`)

    if (config.mode === 'replace') {
      await fs.writeFile(targetPath, summary.content, 'utf-8')
      return
    }
    const newContent = summary.content
    try {
      const existingContent = await fs.readFile(targetPath, 'utf-8')
      const merged = mergeWithMarkers(
        existingContent,
        newContent,
        config.startMarker,
        config.endMarker,
      )
      await fs.writeFile(targetPath, merged, 'utf-8')
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code !== 'ENOENT') {
        throw err
      }

      await fs.writeFile(targetPath, newContent, 'utf-8')
    }
  },
}

export default FileOutputPlugin
