interface ImportMeta {
  glob<T = unknown>(pattern: string | string[], options?: { eager?: boolean }): Record<string, T>
}
