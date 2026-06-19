import os from "os"
import path from "path"

export function expandHome(value: string): string {
  if (value === "~") return os.homedir()
  if (value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

export function resolveTargetHome(value: unknown, defaultPath: string): string {
  if (!value) return defaultPath
  const raw = String(value).trim()
  if (!raw) return defaultPath
  return path.resolve(expandHome(raw))
}

export function resolveCodexHome(value: unknown): string {
  const defaultPath = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex")
  return resolveTargetHome(value, path.resolve(expandHome(defaultPath)))
}

/**
 * Resolve the Hermes profile home (contract §1 — never hardcoded). Precedence:
 * `--hermes-home` flag → `$HERMES_HOME` → `~/.hermes`. Mirrors `resolveCodexHome`
 * exactly: both the explicit flag and the env-var default are `expandHome`-d so
 * `~`-prefixed values resolve on POSIX and Windows; empty/whitespace
 * `HERMES_HOME` falls back to the default via the shared `.trim() || default`
 * guard (Decision D6).
 */
export function resolveHermesHome(value: unknown): string {
  const defaultPath = process.env.HERMES_HOME?.trim() || path.join(os.homedir(), ".hermes")
  return resolveTargetHome(value, path.resolve(expandHome(defaultPath)))
}
