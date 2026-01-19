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
