import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

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

const dependencyNames = Object.keys(pkg.dependencies ?? {})

const isExternal = (id: string): boolean => {
  if (id.startsWith('node:')) return true
  if (nodeBuiltins.includes(id)) return true
  return dependencyNames.some((dep) => id === dep || id.startsWith(`${dep}/`))
}

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
      external: isExternal,
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
