import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { createPluginConfigParser } from './config'

describe('createPluginConfigParser', () => {
  it('parses config with schema defaults when input is missing', () => {
    const schema = z.object({
      path: z.string().default('/tmp/output.md'),
      mode: z.enum(['merge', 'replace']).default('merge'),
    })

    const parseConfig = createPluginConfigParser('file', schema)

    const result = parseConfig(undefined)

    expect(result).toEqual({ path: '/tmp/output.md', mode: 'merge' })
  })

  it('throws descriptive errors when validation fails', () => {
    const schema = z.object({ token: z.string().min(1, 'token is required') })
    const parseConfig = createPluginConfigParser('slack', schema)

    let thrown: unknown
    try {
      parseConfig({ token: '' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    const message = (thrown as Error).message
    expect(message).toContain('Invalid configuration for plugin "slack"')
    expect(message).toContain('- token: token is required')
  })
})
