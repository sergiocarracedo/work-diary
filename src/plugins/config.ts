import { ZodError, z } from 'zod/v4'

const formatIssuePath = (path: (string | number)[]): string => {
  if (path.length === 0) {
    return '<root>'
  }
  return path.map((segment) => segment.toString()).join('.')
}

const buildErrorMessage = (pluginName: string, error: ZodError): string => {
  const issueLines = error.issues.map(
    (issue) =>
      `- ${formatIssuePath(issue.path.filter((p): p is string | number => typeof p !== 'symbol'))}: ${issue.message}`,
  )

  return [
    `Invalid configuration for plugin "${pluginName}".`,
    'Please fix the following issues:',
    ...issueLines,
  ].join('\n')
}

export const createPluginConfigParser = <TSchema extends z.ZodTypeAny>(
  pluginName: string,
  schema: TSchema,
) => {
  return (rawConfig: unknown): z.infer<TSchema> => {
    try {
      return schema.parse(rawConfig ?? {})
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(buildErrorMessage(pluginName, error))
      }
      if (error instanceof Error) {
        throw new Error(`Invalid configuration for plugin "${pluginName}": ${error.message}`)
      }
      throw new Error(`Invalid configuration for plugin "${pluginName}".`)
    }
  }
}
