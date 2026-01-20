import { resolve } from 'node:path'
import { visualizer } from 'rollup-plugin-visualizer'
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

const analyze = process.env.ANALYZE === 'true' || process.env.ANALYZE === '1'

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
      plugins: analyze
        ? [
            visualizer({
              filename: 'dist/cli-visualizer.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : [],
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
