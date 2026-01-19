import type { AiConfig, Logger } from '@/types'
import { anthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

export class AIService {
  private readonly config: AiConfig
  private readonly logger: Logger

  constructor(config: AiConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  private getModel() {
    if (this.config.provider === 'openai') {
      return openai(this.config.model)
    }

    if (this.config.provider === 'anthropic') {
      return anthropic(this.config.model)
    }

    if (this.config.provider === 'google') {
      const google = createGoogleGenerativeAI({
        apiKey: this.config.apiKey,
      })
      return google(this.config.model)
    }

    throw new Error(`Unsupported AI provider: ${this.config.provider}`)
  }

  public async generate(prompt: string, temperature: number): Promise<string> {
    this.logger.info('Generating AI text...')

    const model = this.getModel()

    try {
      const { text } = await generateText({
        model: model as Parameters<typeof generateText>[0]['model'],
        prompt,
        temperature,
      })

      return text
    } catch (error) {
      this.logger.error(`Failed to generate text: ${error}`)
      throw error
    }
  }
}
