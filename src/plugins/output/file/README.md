# File Output Plugin

## Description

Writes the formatted summary to disk. Supports date placeholders in the target path and an optional merge mode that replaces only the marked block within an existing file.

## Configuration

- `path` (string, required) — Target file path. Supports `{date}` placeholder (uses `YYYY-MM-DD`) and expands `~` to your home directory. Example: `~/workdiary-{date}.md`.
- `mode` ("replace" | "merge", optional) — Write strategy. `replace` overwrites the file. `merge` replaces only the block between markers (or appends it if markers are absent). Default: `merge`.
- `startMarker` (string, optional) — Marker that begins the replaceable block. Default: `<!-- workdiary:start -->`.
- `endMarker` (string, optional) — Marker that ends the replaceable block. Default: `<!-- workdiary:end -->`.

Use `merge` when you keep personal notes above/below the generated block and want only that section updated. Keep markers unique per file to avoid unintended replacements.

## Basic config

```yaml
outputs:
  - plugin: file
    config:
      path: '~/workdiary-{date}.md'
      mode: merge
```
