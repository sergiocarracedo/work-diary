import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/cli.ts'),
      formats: ['es'],
      fileName: 'cli',
    },
    target: 'node20',
    outDir: 'dist',
    rollupOptions: {
      external: [
        // Node built-ins
        /^node:.*/,
        'fs',
        'path',
        'url',
        'stream',
        'util',
        'events',
        'crypto',
        'os',
        // Dependencies
        '@octokit/rest',
        '@ai-sdk/openai',
        '@ai-sdk/anthropic',
        'ai',
        'chalk',
        'commander',
        'dotenv',
        'ora',
        'zod',
      ],
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
