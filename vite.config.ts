import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const nodeBuiltins = [
  'fs',
  'path',
  'url',
  'stream',
  'util',
  'events',
  'crypto',
  'os',
  'net',
  'tls',
  'zlib',
  'dns',
  'child_process',
  'querystring',
  'https',
  'http',
  'http2',
  'buffer',
  'assert',
  'string_decoder',
  'process',
]

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
      external: [/^node:.*/, ...nodeBuiltins],
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'cli.js',
        chunkFileNames: 'cli.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
    minify: false,
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
