/**
 * Hermes target types (VHS-20).
 *
 * The Hermes adapter converts a canonical Claude `SKILL.md` into an installable,
 * loadable Hermes skill package. These types describe (a) the normalized
 * capability shape the converter derives from a skill's `requires:` block, and
 * (b) the per-skill bundle the writer emits under `<HERMES_HOME>/skills/`.
 *
 * All §3 interpretation (role-token parsing, `?`-optionality, vocabulary
 * matching) lives in `src/converters/claude-to-hermes.ts`; these types are the
 * harness-neutral carrier (Decision D2).
 */

/**
 * A `required_environment_variables` entry for a credentialed service
 * (contract §3). This is **top-level** frontmatter, a sibling of `metadata` —
 * confirmed against the live harness (2026-06-15): both the official
 * skill-authoring doc and real bundled skills (shopify, siyuan) place it at the
 * top level, NOT under `metadata.hermes`. This resolves the D9 placement
 * ambiguity (the 2026-05-23 wiki snapshot was silent on placement). The
 * credential `name`s remain documented placeholders until per-service MCP
 * tooling is confirmed (Decision D9; see HERMES-MAPPING.md).
 */
export type HermesEnvVar = {
  name: string
  prompt: string
  help: string
  required_for: string
}

/**
 * The `metadata.hermes.*` block the converter emits. Every field is optional and
 * only serialized when non-empty — a skill with no gateable capability emits no
 * `metadata.hermes` block at all (Design § Absent / malformed `requires`).
 * `required_environment_variables` is NOT here — it is top-level frontmatter
 * (see HermesEnvVar).
 */
export type HermesSkillMetadata = {
  requires_toolsets?: string[]
  requires_tools?: string[]
}

/**
 * The normalized capability set derived from a skill's `requires:` block.
 * `filesystem` is `null` when absent, `[]` when declared as a bare `true`, or
 * the declared modes (e.g. `["read", "write"]`). Booleans (`shell`/`network`/
 * `subagents`) are required-when-present; only services carry optionality.
 */
export type HermesNormalizedCapabilities = {
  shell: boolean
  network: boolean
  subagents: boolean
  filesystem: string[] | null
  services: HermesServiceRef[]
}

export type HermesServiceRef = {
  /** Canonical role token (lowercased, `?` stripped), e.g. `issue-tracker`. */
  role: string
  optional: boolean
}

/**
 * One emitted Hermes skill. The converter precomputes the serialized
 * `frontmatter` block (`---\n…\n---\n`, via js-yaml `dump` — Decision D7) and the
 * generated `preflight` preamble (Decision D3). The writer reads the source
 * `SKILL.md` body and assembles the final file, copying supporting subtrees.
 */
export type HermesSkillFile = {
  name: string
  sourceDir: string
  /** Serialized YAML frontmatter, including the `---` fences and trailing newline. */
  frontmatter: string
  /** Generated pre-flight preamble (sentinel + section), or "" when none is emitted. */
  preflight: string
}

export type HermesBundle = {
  pluginName: string
  skills: HermesSkillFile[]
}
