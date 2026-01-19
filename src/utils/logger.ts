import { Logger } from '@/types'
import chalk from 'chalk'

export const logger: Logger = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message)
  },

  success: (message: string) => {
    console.log(chalk.green('✔'), message)
  },

  error: (message: string) => {
    console.error(chalk.red('✖'), message)
  },

  warn: (message: string) => {
    console.warn(chalk.yellow('⚠'), message)
  },

  debug: (message: string) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛'), message)
    }
  },
}
