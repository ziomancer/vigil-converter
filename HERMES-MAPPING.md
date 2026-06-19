# HERMES-MAPPING.md — capability → Hermes affordance mapping

The Hermes target adapter (`--to hermes`, VHS-20) translates a canonical Claude
`SKILL.md`'s flat `requires:` block into an installable Hermes skill package. This
doc records the portability-contract **§3 mapping as implemented**, the
**enumerated gaps** Hermes cannot express, the **provisional placeholders** the
adapter emits, and the **drift** between the wiki snapshot (2026-05-23) the
mapping was authored from and the live harness it was re-verified against
(2026-06-15).

> Sibling of [`STRIP.md`](STRIP.md). The adapter is generated, never
> hand-maintained (contract §1): never hand-edit an emitted package — re-run the
> converter.

## (a) The §3 table, as implemented

| Canonical `requires` | Required (no `?`) | Optional (`?`) |
|---|---|---|
| `shell: true` | `metadata.hermes.requires_toolsets: [terminal]` **+ pre-flight** | n/a — `shell` is a boolean, never optional |
| `services: shared-memory` | `metadata.hermes.requires_toolsets: [memory]` **+ pre-flight** | advisory-only (no gating key) — see gap G1 |
| `services: issue-tracker` | `metadata.hermes.requires_tools: [issue-tracker]` *(provisional name)* **+ top-level `required_environment_variables`** *(credentialed)* **+ pre-flight** | advisory-only — G1 |
| `services: vcs-host` | `requires_tools: [vcs-host]` *(provisional)* **+ `required_environment_variables`** **+ pre-flight** | advisory-only — G1 |
| `services: code-review-bot` | `requires_tools: [code-review-bot]` *(provisional)* **+ `required_environment_variables`** **+ pre-flight** | advisory-only — G1 |
| `network: true` | **pre-flight only** — no gating key (gap G2) | n/a |
| `subagents: true` | **pre-flight only** — no gating key (gap G2) | n/a |
| `filesystem: [read, write]` | **pre-flight only** — no gating key (gap G2) | n/a |

**Service-token normalization (adapter-side).** For each `services` element:
`trim()` → strip exactly one trailing `?` (records optionality) → `trim()` →
lowercase-exact-match against the controlled vocabulary
`{issue-tracker, shared-memory, code-review-bot, vcs-host}`. Roles are
deduplicated; if a role appears both required and optional, **required wins**. A
token that does not match after normalization is **warned and recorded as a gap**
(below), never silently dropped, and emits no gating key.

**Frontmatter classes (contract §2).** `name` + `description` preserved verbatim
(`description` drives Level-0 `skills_list` disclosure). `user_invocable` dropped
(every Hermes skill is already a slash command). `allowed-tools`,
`argument-hint`, `disable-model-invocation`, `model`, `ce_platforms` dropped
(Claude-only / CE-legacy). `version` / `platforms` are not synthesized in v1 (no
source value to derive — declare-don't-infer).

**Serialization.** Nested `metadata.hermes.*` is serialized with js-yaml `dump`
(the engine's `formatFrontmatter` renders a nested object as `"[object Object]"`).

## (b) Gaps — what Hermes cannot express, and how the adapter compensates

The §3 mapping is **lossy in kind**: Hermes `requires_*` keys *gate visibility*
(hide/show a skill), whereas the canonical `requires:` is a *hard pre-flight
contract* (a missing **required** capability must fail clearly before any
mutation). The adapter compensates with a generated pre-flight and documents
each residual gap. None is silently dropped.

- **G1 — Optional (`?`) services are not gateable.** Hermes
  `requires_toolsets`/`requires_tools` **hide** a skill when the toolset/tool is
  unavailable; `fallback_for_*` is the inverse. Neither expresses "always shown;
  use the service if present, warn if not." So **optional services emit no
  gating key**; they surface as a warn-and-proceed advisory line in the
  generated pre-flight. Fed back to VHS-17 as a §3 clarification request (the §3
  table is silent on the optional-service mapping).
- **G2 — `network` / `subagents` / `filesystem` have no hard-contract gating
  key.** Hermes has `file` and `delegation` toolsets, but those are *visibility*
  affordances (hide-when-absent), not the required *hard-fail-before-mutation*
  semantics. The adapter emits **no gating key** for these three and relies on
  the pre-flight. (`subagents` ≈ the `delegation` toolset; emitting
  `requires_toolsets: [delegation]` as a belt-and-suspenders visibility gate is
  permitted but non-normative — the pre-flight remains the hard guard. v1 does
  not emit it.)
- **G3 — The pre-flight is advisory-by-construction.** On Hermes a skill is the
  markdown the agent reads at `skill_view` (progressive disclosure); the
  converter only emits files and has no load-time callback. The strongest gate
  the *adapter* can emit is a clearly-delimited, sentinel-marked generated
  section (`<!-- vigil-converter:hermes-preflight v1 -->`) prepended to the body,
  instructing a halt-before-mutation when any required capability is unavailable.
  This is **prose the agent is asked to honor**, not a runtime callback / exit
  code — materially weaker than the contract's "a harness MUST verify each
  required capability before any mutation and fail clearly" (§3), which is a
  **harness** obligation. The adapter discharges *its* half (emit the gate, emit
  the gating keys where Hermes has them, document the gap); full runtime
  enforcement depends on Hermes honoring the prose. **Re-verify (2026-06-15):**
  no native skill-load pre-flight / validation hook is exposed by the Hermes
  skills CLI — there was nothing to wire the check into, so the preamble stands
  as the gate. If a future Hermes exposes such a hook, wire the check there too.

## (c) Provisional placeholders (Decision D9)

Until per-service MCP tooling is confirmed, the adapter emits deterministic,
**documented** placeholders rather than silently guessing:

| Role | `requires_tools` name (provisional) | `required_environment_variables[].name` (provisional) |
|---|---|---|
| `issue-tracker` | `issue-tracker` | `ISSUE_TRACKER_TOKEN` |
| `vcs-host` | `vcs-host` | `VCS_HOST_TOKEN` |
| `code-review-bot` | `code-review-bot` | `CODE_REVIEW_BOT_TOKEN` |
| `shared-memory` | *(maps to `requires_toolsets: [memory]`, no credential)* | — |

Each `required_environment_variables` entry carries `{name, prompt, help,
required_for}`. The CI smoke test asserts the *shape* (the array exists and each
entry has those keys), never the exact name.

## (d) Drift log — wiki snapshot (2026-05-23) vs live harness (2026-06-15)

Re-verified against the running Hermes (`hermes` CLI; `HERMES_HOME` profile) and
the in-tree authoring docs (`website/docs/developer-guide/creating-skills.md`).

- **RESOLVED — `required_environment_variables` placement is TOP-LEVEL, not
  nested under `metadata.hermes`.** The 2026-05-23 snapshot documented the field
  in a standalone section and omitted it from the `metadata.hermes.*` field
  table, leaving placement genuinely ambiguous (the brief's provisional default
  was *nested*). The live harness is unambiguous: the canonical authoring example
  and real bundled skills (`shopify`, `siyuan`) place it at the **top level**, a
  sibling of `metadata`. **The emitter places it top-level** (D9: "if re-verify
  shows top-level, move it out of `metadata.hermes`"). The Tier-1 YAML round-trip
  assertion cannot distinguish the two placements, so this was checked against
  the live harness, not the smoke test.
- **CONFIRMED — toolset names.** `terminal`, `memory`, `delegation` are valid
  toolset identifiers (`tools-and-toolsets.md`; live `--toolsets`). `shell` →
  `terminal` and `services: shared-memory` → `memory` hold.
- **CONFIRMED — nested `metadata.hermes.*` keys.** `requires_toolsets`,
  `requires_tools`, `fallback_for_toolsets`, `fallback_for_tools`, `tags`,
  `category`, `config` are nested under `metadata.hermes` (live bundled skill
  `creative/creative-ideation` shows `metadata.hermes.requires_toolsets`).
- **CONFIRMED — no native skill-load pre-flight / validation hook** in the Hermes
  skills CLI (see G3). The preamble is the gate.
- **CONFIRMED — `~/.hermes/skills/` (per-profile via `HERMES_HOME`) is the single
  source of truth**, each skill its own dir with `SKILL.md` + optional
  `references/`, `templates/`, `scripts/`, `assets/`. The writer is therefore
  non-destructive of user content (see below).

## Writer posture (non-destructive)

`<HERMES_HOME>/skills/` is where agent-created and user-edited skills live, so the
writer **overwrites the generated `SKILL.md` and additively copies source
subtrees** — it never blanket-`rm`s the per-skill directory. A blanket
clean-replace is acceptable only against a freshly-created / dedicated
`HERMES_HOME` (e.g. the CI temp home). Stale converter-orphan cleanup (the
inherited install-manifest mechanism) is a deliberately deferred enhancement;
`kiro` is the manifest-free structural sibling.

## Acceptance status (Done-when)

- **Tier-1 (CI smoke, blocking)** — green: `scripts/smoke-test.ts` exercises the
  full §3 mapping over `samples/skills/` on every CI run.
- **Tier-2 (live install/load, captured)** — the four vigil skills (`spec-cycle`,
  `ship-spec`, `spec-close`, `review-pr`) convert and **load under the live
  Hermes**: `hermes skills list` lists all four as enabled local skills, and
  Hermes parses each emitted frontmatter without error (validating the nested
  `metadata.hermes` + top-level `required_environment_variables` shape). Every
  installed skill is automatically a slash command. Evidence captured in the
  acceptance trail (`VHS-20.test-output.txt`). The interactive `skill_view`
  render and a full `hermes chat` round-trip require provider auth and were not
  captured non-interactively; the listed + cleanly-parsed state is the captured
  install/load proof.
