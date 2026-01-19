import { createPluginConfigParser } from '@/plugins/config'
import { Plugin, PluginContext, PluginSummaryResult } from '@/types/plugins'
import { DEFAULT_END_MARKER, DEFAULT_START_MARKER } from '@/utils/markers'
import { z } from 'zod/v4'

const markdownConfigSchema = z.object({})

export type MarkdownConfig = z.infer<typeof markdownConfigSchema>

const MarkdownPlugin: Plugin<typeof markdownConfigSchema> = {
  name: 'markdown',
  configSchema: markdownConfigSchema,
  parseConfig: createPluginConfigParser('markdown', markdownConfigSchema),
  description: 'Converts the daily summary into Markdown format.',
  format: async (ctx: PluginContext, summaries: PluginSummaryResult[]) => {
    const lines: string[] = []

    // Frontmatter
    lines.push('---')
    lines.push(`date: ${ctx.date.toISOString().split('T')[0]}`)
    lines.push(`generated_at: ${new Date().toISOString()}`)
    lines.push('type: workdiary')
    lines.push('---')
    lines.push('')

    // Replaceable section markers
    lines.push(DEFAULT_START_MARKER)
    lines.push('')

    // Title
    lines.push(`# Daily Summary for ${ctx.date.toDateString()}`)
    lines.push('')

    const sections = summaries
      .map((s) => {
        const section: string[] = []
        section.push('## Summary from ' + s.pluginName)
        if (s.summary) {
          section.push(s.summary)
        }
        return section.join('\n')
      })
      .join('\n\n---\n\n')

    lines.push(sections)

    lines.push('')
    lines.push(DEFAULT_END_MARKER)

    return {
      content: lines.join('\n'),
    }
  },
}

export default MarkdownPlugin
