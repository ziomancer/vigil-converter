/**
 * Claude → Hermes converter (VHS-20).
 *
 * Reads each skill's harness-neutral `requires:` block (carried by the parser,
 * Decision D2), applies the portability-contract §3 capability→affordance
 * mapping, and produces a `HermesBundle`: per-skill nested `metadata.hermes`
 * frontmatter (serialized with js-yaml `dump` — Decision D7) plus a generated,
 * sentinel-marked capability pre-flight preamble (Decision D3).
 *
 * Security (Decision D10): parse-and-transform only. This module reads parsed
 * frontmatter + body and reshapes them into strings — it never evaluates,
 * sources, or executes any part of a skill.
 *
 * The §3 mapping values are **provisional pending live-harness re-verify**
 * (Decision D9): the credential env-var names are documented placeholders and
 * the `required_environment_variables` placement (nested vs. top-level) follows
 * the brief's provisional default. See HERMES-MAPPING.md.
 */
import { dump } from "js-yaml"
import { parseFrontmatter } from "../utils/frontmatter"
import type { ClaudePlugin } from "../types/claude"
import { filterSkillsByPlatform } from "../types/claude"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"
import type {
  HermesBundle,
  HermesEnvVar,
  HermesNormalizedCapabilities,
  HermesServiceRef,
  HermesSkillFile,
  HermesSkillMetadata,
} from "../types/hermes"

/** Machine-detectable marker the smoke test asserts on (Decision D3). */
export const PREFLIGHT_SENTINEL = "<!-- vigil-converter:hermes-preflight v1 -->"

type ServiceAffordance =
  | { kind: "toolset"; target: string }
  | { kind: "tool"; target: string; envVar: string }

/**
 * Controlled service vocabulary → Hermes affordance (contract §3). Credentialed
 * MCP-backed roles map to `requires_tools` + a `required_environment_variables`
 * entry; `shared-memory` maps to the `memory` toolset (no credential). The tool
 * names and env-var names are **provisional placeholders** (Decision D9).
 */
const SERVICE_MAP: Record<string, ServiceAffordance> = {
  "shared-memory": { kind: "toolset", target: "memory" },
  "issue-tracker": { kind: "tool", target: "issue-tracker", envVar: "ISSUE_TRACKER_TOKEN" },
  "vcs-host": { kind: "tool", target: "vcs-host", envVar: "VCS_HOST_TOKEN" },
  "code-review-bot": { kind: "tool", target: "code-review-bot", envVar: "CODE_REVIEW_BOT_TOKEN" },
}

export function convertClaudeToHermes(
  plugin: ClaudePlugin,
  _options: ClaudeToOpenCodeOptions,
): HermesBundle {
  // Always return a (possibly empty) bundle for a parsed plugin — never null.
  // `null` is the hard-abort signal at convert.ts (`if (!bundle)` throws); an
  // empty / no-`requires` skills root must emit ungated, not abort (D-null).
  const skills: HermesSkillFile[] = filterSkillsByPlatform(plugin.skills, "hermes").map((skill) => {
    const caps = normalizeCapabilities(skill.requires, skill.name)
    const { metadata, envVars } = buildFrontmatterModel(caps)
    const preflight = buildPreflight(caps)
    const frontmatter = buildFrontmatter(skill.name, skill.description, metadata, envVars)
    return { name: skill.name, sourceDir: skill.sourceDir, frontmatter, preflight }
  })
  return { pluginName: plugin.manifest.name, skills }
}

/**
 * Assemble the final emitted `SKILL.md`: generated frontmatter, the optional
 * pre-flight preamble, then the author body verbatim (Design § Per-skill
 * emission). The writer calls this as a `copySkillDir` transform closing over
 * the precomputed per-skill strings, so the generated file wins over the
 * verbatim source while supporting subtrees are copied in the same pass.
 */
export function renderHermesSkillContent(skill: HermesSkillFile, sourceRaw: string): string {
  const { body } = parseFrontmatter(sourceRaw, skill.sourceDir)
  const authorBody = body.replace(/^\r?\n+/, "").replace(/\s+$/, "")
  const preamble = skill.preflight ? `${skill.preflight}\n\n` : ""
  return `${skill.frontmatter}\n${preamble}${authorBody}\n`
}

// --- §3 interpretation (all harness-specific logic lives here, Decision D2) ---

function normalizeCapabilities(
  requires: Record<string, unknown> | undefined,
  skillName: string,
): HermesNormalizedCapabilities {
  const caps: HermesNormalizedCapabilities = {
    shell: false,
    network: false,
    subagents: false,
    filesystem: null,
    services: [],
  }
  if (!requires) return caps

  for (const [key, value] of Object.entries(requires)) {
    switch (key) {
      case "shell":
        caps.shell = value === true
        break
      case "network":
        caps.network = value === true
        break
      case "subagents":
        caps.subagents = value === true
        break
      case "filesystem":
        // `[read, write]` → modes; bare `true` → present-without-modes (`[]`);
        // anything falsy → absent (`null`).
        if (Array.isArray(value)) caps.filesystem = value.map((mode) => String(mode))
        else if (value) caps.filesystem = []
        break
      case "services":
        caps.services = normalizeServices(value, skillName)
        break
      default:
        // Unknown keys (e.g. the legacy `tools:`) are ignored with a warning —
        // the adapter is robust to well-formed-but-non-conformant input; lint
        // is VHS-18's job, not the adapter's (Design § Absent / malformed).
        console.warn(
          `[hermes] skill "${skillName}": ignoring unrecognized requires key "${key}" (not a contract §3 capability)`,
        )
    }
  }
  return caps
}

/**
 * Restate the slice of the §3 service-token lexical rules the adapter depends on
 * (the canonical validator is VHS-18). For each element: trim → strip exactly
 * one trailing `?` (records optionality) → trim → lowercase-exact-match against
 * the controlled vocabulary. Out-of-vocab tokens are warned + dropped (recorded
 * as a gap in HERMES-MAPPING.md — never silently). Roles are deduplicated;
 * required wins over optional for the same role.
 */
function normalizeServices(raw: unknown, skillName: string): HermesServiceRef[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) {
      console.warn(
        `[hermes] skill "${skillName}": \`requires.services\` is not a list — ignoring, emitting ungated`,
      )
    }
    return []
  }

  const byRole = new Map<string, boolean>() // role -> optional (false/required wins)
  for (const element of raw) {
    let token = String(element).trim()
    let optional = false
    if (token.endsWith("?")) {
      optional = true
      token = token.slice(0, -1)
    }
    token = token.trim().toLowerCase()
    if (!(token in SERVICE_MAP)) {
      console.warn(
        `[hermes] skill "${skillName}": unrecognized service role "${String(element)}" — emitting ungated, recorded as a gap`,
      )
      continue
    }
    if (byRole.has(token)) {
      // required wins: result is optional only when every occurrence is optional.
      byRole.set(token, byRole.get(token)! && optional)
    } else {
      byRole.set(token, optional)
    }
  }
  return [...byRole.entries()].map(([role, optional]) => ({ role, optional }))
}

/**
 * Build the gating model: the nested `metadata.hermes` block (`requires_toolsets`
 * / `requires_tools`) plus the **top-level** `required_environment_variables`
 * list (placement confirmed against the live harness — D9). Optional services
 * emit NO gating key (D4); `network`/`subagents`/`filesystem` emit NO gating key
 * — pre-flight only (D5). `metadata` is null when there is nothing to nest.
 */
function buildFrontmatterModel(caps: HermesNormalizedCapabilities): {
  metadata: HermesSkillMetadata | null
  envVars: HermesEnvVar[]
} {
  const requiresToolsets: string[] = []
  const requiresTools: string[] = []
  const envVars: HermesEnvVar[] = []

  if (caps.shell) requiresToolsets.push("terminal")

  for (const svc of caps.services) {
    if (svc.optional) continue // D4: optional → advisory-only, no gating key
    const affordance = SERVICE_MAP[svc.role]
    if (!affordance) continue
    if (affordance.kind === "toolset") {
      requiresToolsets.push(affordance.target)
    } else {
      requiresTools.push(affordance.target)
      envVars.push({
        name: affordance.envVar,
        prompt: `Credential for the ${svc.role} service`,
        help: `Provide the access token the ${svc.role} integration authenticates with.`,
        required_for: svc.role,
      })
    }
  }

  const meta: HermesSkillMetadata = {}
  if (requiresToolsets.length) meta.requires_toolsets = unique(requiresToolsets)
  if (requiresTools.length) meta.requires_tools = unique(requiresTools)
  return { metadata: Object.keys(meta).length > 0 ? meta : null, envVars }
}

/**
 * Generate the hard pre-flight preamble (Decision D3). Emitted only when ≥1
 * REQUIRED (no-`?`) capability exists — a skill with no `requires:` or only
 * optional services gets none. Advisory-by-construction: it is prose the agent
 * is asked to honor, not a runtime callback (documented gap, HERMES-MAPPING.md).
 */
function buildPreflight(caps: HermesNormalizedCapabilities): string {
  const required: string[] = []
  if (caps.shell) required.push("shell (terminal toolset)")
  if (caps.network) required.push("network")
  if (caps.subagents) required.push("subagents")
  if (caps.filesystem) {
    required.push(caps.filesystem.length ? `filesystem [${caps.filesystem.join(", ")}]` : "filesystem")
  }
  for (const svc of caps.services) {
    if (!svc.optional) required.push(`service:${svc.role}`)
  }
  if (required.length === 0) return ""

  const optional = caps.services.filter((svc) => svc.optional).map((svc) => `service:${svc.role}`)
  const lines = [
    PREFLIGHT_SENTINEL,
    "## Capability pre-flight (generated by the Hermes adapter — do not edit)",
    "",
    "Before any action that mutates state, confirm each REQUIRED capability below is",
    "available. If any is unavailable, halt immediately and report which one — do not",
    "proceed. OPTIONAL capabilities: if unavailable, warn and continue.",
    "",
    `Required: ${required.join(", ")}`,
  ]
  if (optional.length) lines.push(`Optional (warn-and-proceed): ${optional.join(", ")}`)
  return lines.join("\n")
}

/**
 * Serialize the nested frontmatter with js-yaml `dump` (Decision D7) — the
 * engine's `formatFrontmatter` only handles scalars/flat arrays and would render
 * a nested `metadata.hermes` object as `"[object Object]"`. `metadata` is nested
 * under `metadata.hermes`; `required_environment_variables` is top-level (D9),
 * emitted after `metadata` to match the canonical Hermes example ordering.
 */
function buildFrontmatter(
  name: string,
  description: string | undefined,
  metadata: HermesSkillMetadata | null,
  envVars: HermesEnvVar[],
): string {
  const frontmatter: Record<string, unknown> = { name }
  if (description !== undefined) frontmatter.description = description
  if (metadata) frontmatter.metadata = { hermes: metadata }
  if (envVars.length) frontmatter.required_environment_variables = envVars
  const yaml = dump(frontmatter, { lineWidth: -1, noRefs: true, sortKeys: false })
  return `---\n${yaml}---\n`
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
