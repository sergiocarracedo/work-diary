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
        // Node built-ins stay external; dependencies are bundled for release tags
        /^node:.*/,
        'fs',
        'path',
        'url',
        'stream',
        'util',
        'events',
        'crypto',
        'os',
      ],
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
