# vigil-converter

An owned, security-vetted fork of [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)'s
converter **engine**, stripped of product-specific content and retargeted to read
the canonical Claude Code `SKILL.md` tree. It emits per-harness skill packages
from a single canonical source.

- **Input:** a Claude Code skills tree — either a plugin directory (with
  `.claude-plugin/plugin.json`) or a bare skills root such as `~/.claude/skills/`
  (`<root>/<skill>/SKILL.md`), no manifest required.
- **Output:** per-harness packages for the inherited targets (OpenCode, Codex,
  Gemini, Pi, Kiro).

This is the conversion engine that per-harness adapters build on. It is **not** an
adapter and **not** a conformance/parity test.

## Usage

```sh
bun install --frozen-lockfile

# Convert a skills tree to OpenCode (default target)
bun run src/index.ts convert ~/.claude/skills --to opencode --output ./out

# Other inherited targets
bun run src/index.ts convert <skills-root> --to codex   --output ./out
bun run src/index.ts convert <skills-root> --to gemini  --output ./out
```

The input path is an explicit argument — no home directory is hardcoded, so the
same command works for a developer's `~/.claude/skills/` and for the pinned CI
sample.

## Engine-liveness smoke test

```sh
bun run scripts/smoke-test.ts   # also: bun test
```

The smoke test runs two paths over the **pinned sample** in [`samples/skills/`](samples/skills)
(committed so CI is deterministic and independent of any installed
`~/.claude/skills/`):

1. **Ingest / parse** — load the canonical `SKILL.md` tree and parse frontmatter +
   body without error, asserting **≥ 1 skill parsed** (an empty/missing sample
   fails closed).
2. **Convert end-to-end to OpenCode** (Codex fallback) — assert the CLI exits 0
   and emits non-empty, structurally well-formed output.

It proves the engine *runs* after the strip. It does **not** certify output
correctness — conformance/parity is out of scope here. CI runs this on every push
and PR (`.github/workflows/ci.yml`); the green run is this repo's acceptance gate.

## Fork provenance

| | |
|---|---|
| **Upstream** | [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) (MIT) |
| **Fork point (upstream SHA)** | `0757e859d21e860a1fc0424bfcbbb35a1e597771` |
| **Repo home** | https://github.com/ziomancer/vigil-converter |
| **`upstream` remote** | `git@github.com:ziomancer/vigil-converter.git` tracks EveryInc for cherry-picks |

The strip and every local change are a reviewable delta from the fork point — see
[`STRIP.md`](STRIP.md). Upstream history at and before the fork point is retained
so engine/security fixes stay cherry-pickable.

### Upstream update cadence

- Review upstream `main` **monthly**; engine and security fixes are cherry-picked
  through the recorded diff (`git log upstream/main --since=<fork-point>`).
- Security patches are **expedited** outside the monthly cadence.

## Supply chain & security posture

- **Dependency audit:** `bun audit` — **no vulnerabilities found** (run 2026-06-15).
  Runtime dependencies are minimal: `citty` (CLI) and `js-yaml` (frontmatter).
- **Pinned versions:** all versions are pinned in the committed `bun.lock`; CI
  installs with `bun install --frozen-lockfile`.
- **The converter never executes skill content during conversion.** The
  conversion path (`src/`) was inspected for the Bun-aware execution sink set —
  `Bun.spawn`, `` Bun.$ ``/`` $` `` (Bun shell), `execSync`, and the Node set
  (`eval`, `new Function`, `child_process`, `exec`, `spawn`) — and contains
  **none**. (Upstream's only `Bun.spawn` sites were the `install`/`plugin-path`
  commands, removed in the strip.) Skill frontmatter and body are parsed as data
  (`js-yaml`), never evaluated.
  - **Scope boundary (explicit non-claim):** a converter is a code-generation
    step; it legitimately *emits* artifacts that the **target runtime** later
    executes (e.g. an OpenCode package may carry hook command strings). "Never
    executes skill content" covers the **conversion process**, not the emitted
    package's later execution by its host harness.

## License

MIT — see [`LICENSE`](LICENSE). This fork retains upstream's copyright notice as
required; see [`STRIP.md`](STRIP.md) for the provenance of forked code.
