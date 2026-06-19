# STRIP.md — the documented diff from upstream

This fork reduces [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)
to its bare conversion **engine**. Everything here is a reviewable delta from the
recorded fork point so upstream engine/security fixes stay cherry-pickable.

- **Fork point:** `0757e859d21e860a1fc0424bfcbbb35a1e597771` (upstream `main`).
- **Review surface:** `git log upstream/main --since=<fork-point>` for new upstream
  commits; `git diff 0757e859..HEAD` for this fork's changes.
- The removals below are individual labeled commits (`strip(ce): …`,
  `feat(parser): …`, `chore(brand): …`), not an opaque rewrite.

## Removed — CE product content

| Path | Why |
|------|-----|
| `plugins/compound-engineering/` | The CE product plugin: skills, agents/personas, manifests |
| `.agents/`, `.claude-plugin/`, `.cursor-plugin/`, `.compound-engineering/` | Marketplace / plugin metadata |
| `docs/` | CE brainstorms / plans / specs / solutions |
| `AGENTS.md`, `CONCEPTS.md`, `PRIVACY.md`, `CHANGELOG.md`, `CLAUDE.md`, `favicon.png` | CE product docs / branding |
| `scripts/release/`, `src/release/`, release-please configs, `deploy-docs`/`release-*` workflows | CE release pipeline |
| `src/commands/install.ts`, `list.ts`, `plugin-path.ts` | CE marketplace / distribution commands (not conversion) |
| `src/commands/cleanup.ts` | CE-install janitorial command (hardcoded to the `compound-engineering` plugin) |
| `tests/` (entire inherited suite) | Coupled to the CE plugin tree as a fixture; asserts CE product/parity behavior — out of scope (see below) |

CE content remains in git history at and before the fork point (intentional — the
cherry-pick surface).

## Changed — the engine

- **`feat(parser)` — input retarget (`src/parsers/claude.ts`).** Upstream required
  a `.claude-plugin/plugin.json` manifest and read skills from `<root>/skills/`.
  This fork makes the manifest **optional** (synthesizes a default when absent)
  and treats the input path itself as the **skills root**, so a canonical bare
  `~/.claude/skills/` tree (`<root>/<skill>/SKILL.md`) ingests directly. Path
  resolution stays portable (no hardcoded home). This is the one load-bearing
  behavioral change.
- **`chore(brand)`** — `package.json` renamed to `vigil-converter` (bin, scripts,
  description, version `0.1.0`); `semantic-release` devDeps dropped (release
  pipeline removed); `bun.lock` re-synced; `SECURITY.md` neutralized; `README.md`
  rewritten; CI replaced with the engine-liveness smoke test.
- **`strip(ce)` — CE legacy-artifact registry emptied.**
  `src/data/plugin-legacy-artifacts.ts` shipped a hardcoded registry of CE skill/
  agent/command names (`EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"]`).
  The CE data is removed, leaving the registry empty (`{}`) and the engine getter
  functions intact. The targets call those getters during `write`; with an empty
  registry they return nothing, so the legacy-stale-artifact subsystem is now
  **inert** for any non-CE input (including the canonical skills tree).

## Added

- `samples/skills/` — a pinned, committed sample skills root (two `SKILL.md`s, one
  carrying a `requires:` capability block) so CI is deterministic.
- `scripts/smoke-test.ts` — the two-path engine-liveness smoke test (ingest +
  convert to OpenCode, Codex fallback). See README.
- **`--to hermes` target (VHS-20)** — the owned Hermes output adapter (the one
  target CE never shipped): `src/converters/claude-to-hermes.ts`,
  `src/targets/hermes.ts`, `src/types/hermes.ts`, `resolveHermesHome`, and the
  additive `ClaudeSkill.requires` parser field. The capability→affordance mapping
  and gap log live in [`HERMES-MAPPING.md`](HERMES-MAPPING.md); the smoke test
  gained a Hermes path.

## Known retained entanglement (filed, not rewritten)

Beyond the emptied registry, ~30 `compound-engineering`/`compound-plugin`
identifiers remain in the engine's **legacy-compat internals** — e.g.
`src/targets/managed-artifacts.ts` (`LEGACY_MANAGED_SEGMENT`), legacy path
segments and emitted markers in `src/targets/{codex,kiro,pi,gemini,opencode}.ts`,
target special-cases in `src/converters/`, and the CE-stale-install heuristics in
`src/utils/legacy-cleanup.ts` (imported by the targets' write path).

These are **converter internals, not product content**, and the targets import
them — decoupling them would mean rewriting the converter, which this fork
deliberately does **not** do (it would break cherry-pick compatibility with
upstream and risks the engine). They are functionally inert for the canonical
input (the registry that drove them is empty). **Fully neutralizing these
identifiers is a tracked follow-up**, separate from standing up the engine.

## Out of scope (tracked elsewhere)

- The inherited unit/parity test suite was removed rather than ported; the
  smoke test is the engine-liveness gate. Re-introducing engine unit tests
  decoupled from CE fixtures is a future enhancement.
- Validating the inherited target outputs (OpenCode/Codex/…) — conformance/parity.
- Adding new adapters (e.g. Hermes) — built on this engine, separately.
