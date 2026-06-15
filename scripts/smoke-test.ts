#!/usr/bin/env bun
/**
 * Two-path engine-liveness smoke test (VHS-19, decision D6).
 *
 * Proves the stripped converter still runs end-to-end over a pinned, committed
 * sample skill set. It deliberately does NOT certify output correctness — that
 * is conformance/parity work (VHS-21), explicitly out of scope here.
 *
 *   (a) Source ingestion / parse check — parse the canonical `SKILL.md` tree
 *       without error AND assert at least one skill was parsed (count > 0), so
 *       an empty or missing sample fails closed, independently of path (b).
 *   (b) One real inherited target, end-to-end — convert the sample to OpenCode
 *       (Codex is the documented fallback). Assert the CLI exits 0 and emits
 *       non-empty, structurally well-formed output.
 *
 * Deterministic: reads only the committed `samples/skills/` tree (never the
 * caller's `~/.claude/skills/`), and writes only to a fresh temp directory.
 */
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { loadClaudePlugin } from "../src/parsers/claude"
import { parseFrontmatter } from "../src/utils/frontmatter"

const repoRoot = path.resolve(import.meta.dir, "..")
const samplePath = path.join(repoRoot, "samples", "skills")

function fail(msg: string): never {
  console.error(`✗ SMOKE TEST FAILED: ${msg}`)
  process.exit(1)
}

function info(msg: string): void {
  console.log(msg)
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

// ---- Path (a): source ingestion / parse check -----------------------------
info(`[a] Ingesting sample skills root: ${samplePath}`)
let parsedSkillCount = 0
try {
  const plugin = await loadClaudePlugin(samplePath)
  parsedSkillCount = plugin.skills.length
  if (parsedSkillCount < 1) {
    fail(`parsed 0 skills from ${samplePath} — expected >= 1 (empty/missing sample fails closed)`)
  }
  info(`[a] OK — parsed ${parsedSkillCount} skill(s): ${plugin.skills.map((s) => s.name).join(", ")}`)
} catch (err) {
  fail(`ingestion threw: ${(err as Error).message}`)
}

// ---- Path (b): one real inherited target, end-to-end ----------------------
const candidates = ["opencode", "codex"] // OpenCode primary; Codex documented fallback (D6)
let converted: { target: string; outDir: string } | null = null

for (const target of candidates) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `vigil-smoke-${target}-`))
  info(`[b] Converting sample -> ${target} (output: ${outDir})`)
  const proc = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "convert", samplePath, "--to", target, "--output", outDir],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  )
  if (proc.exitCode !== 0) {
    const lastErr = proc.stderr.toString().trim().split("\n").pop() ?? ""
    info(`[b] ${target} exited ${proc.exitCode}: ${lastErr} — trying next candidate`)
    continue
  }
  const nonEmpty = listFiles(outDir).filter((f) => fs.statSync(f).size > 0)
  if (nonEmpty.length === 0) {
    info(`[b] ${target} exited 0 but produced no non-empty output — trying next candidate`)
    continue
  }
  converted = { target, outDir }
  info(`[b] OK — ${target} exited 0 and emitted ${nonEmpty.length} non-empty file(s)`)
  break
}

if (!converted) {
  fail("no inherited target (opencode, codex) produced non-empty output")
}

// ---- Structural well-formedness check (OpenCode primary path) --------------
if (converted.target === "opencode") {
  // (1) well-formed config: opencode.json must exist and parse as JSON
  const configPath = path.join(converted.outDir, "opencode.json")
  if (!fs.existsSync(configPath)) fail(`opencode.json missing under ${converted.outDir}`)
  try {
    JSON.parse(fs.readFileSync(configPath, "utf8"))
  } catch (err) {
    fail(`opencode.json is not valid JSON: ${(err as Error).message}`)
  }
  // (2) emitted skills: one .opencode/skills/<name>/SKILL.md per parsed skill
  const skillsDir = path.join(converted.outDir, ".opencode", "skills")
  const emittedSkills = fs.existsSync(skillsDir)
    ? fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, "SKILL.md")))
        .map((e) => e.name)
    : []
  if (emittedSkills.length !== parsedSkillCount) {
    fail(`emitted ${emittedSkills.length} skill package(s) but parsed ${parsedSkillCount}`)
  }
  info(
    `[b] OK — opencode.json is valid JSON; emitted ${emittedSkills.length} skill package(s) matching parsed count: ${emittedSkills.join(", ")}`,
  )
}

// ---- Path (c): Hermes target — structural + mapping assertions (VHS-20) ----
// Additive to paths (a)/(b): proves the engine emits a structurally correct,
// mapping-correct Hermes package after the change. All structural assertions
// parse the emitted SKILL.md and assert on PARSED values, never raw frontmatter
// lines (js-yaml `dump` may reflow scalars). CI has no live Hermes, so this is
// the automated (Tier-1) gate; live install/load is the manual Tier-2 proof.
const HERMES_SENTINEL = "<!-- vigil-converter:hermes-preflight v1 -->"

function parseSkillFile(file: string): { data: Record<string, unknown>; body: string } {
  return parseFrontmatter(fs.readFileSync(file, "utf8"), file)
}
function hermesMeta(data: Record<string, unknown>): Record<string, unknown> {
  const meta = (data.metadata as Record<string, unknown> | undefined)?.hermes
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
}

const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), "vigil-smoke-hermes-"))
const robustRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vigil-smoke-hermes-robust-"))
try {
  info(`[c] Converting sample -> hermes (home: ${hermesHome})`)
  const proc = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "convert", samplePath, "--to", "hermes", "--hermes-home", hermesHome],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  )
  if (proc.exitCode !== 0) {
    fail(`hermes conversion exited ${proc.exitCode}: ${proc.stderr.toString().trim().split("\n").pop() ?? ""}`)
  }
  const hermesSkillsDir = path.join(hermesHome, "skills")
  const sourcePlugin = await loadClaudePlugin(samplePath)
  const sourceByName = new Map(sourcePlugin.skills.map((s) => [s.name, s]))

  // (1) Package shape — every parsed skill has a non-empty emitted SKILL.md.
  for (const skill of sourcePlugin.skills) {
    const file = path.join(hermesSkillsDir, skill.name, "SKILL.md")
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      fail(`hermes: expected non-empty ${file} for skill "${skill.name}"`)
    }
  }
  info(`[c] OK — ${sourcePlugin.skills.length} Hermes package(s) emitted`)

  // (2) No-`requires` case (hello-world) — name+desc, no gating keys, no sentinel.
  const hw = parseSkillFile(path.join(hermesSkillsDir, "hello-world", "SKILL.md"))
  if (!hw.data.name || !hw.data.description) fail("hermes hello-world: missing name/description")
  const hwMeta = hermesMeta(hw.data)
  if (hwMeta.requires_toolsets || hwMeta.requires_tools || hwMeta.required_environment_variables) {
    fail("hermes hello-world: expected no gating keys for a no-`requires` skill")
  }
  if (hw.body.includes(HERMES_SENTINEL)) fail("hermes hello-world: unexpected pre-flight sentinel")
  info("[c] OK — hello-world ungated (no gating keys, no pre-flight)")

  // (3)+(5)+(6) Full-mapping case (capability-demo).
  const cd = parseSkillFile(path.join(hermesSkillsDir, "capability-demo", "SKILL.md"))
  // (6) Nested block well-formed — `metadata.hermes` is a real mapping, not the
  //     string "[object Object]" (guards the D7 `dump` requirement).
  if (typeof (cd.data.metadata as Record<string, unknown> | undefined)?.hermes !== "object") {
    fail("hermes capability-demo: metadata.hermes is not a nested mapping (D7 `dump` regression)")
  }
  const cdMeta = hermesMeta(cd.data)
  const toolsets = (cdMeta.requires_toolsets as string[]) ?? []
  const tools = (cdMeta.requires_tools as string[]) ?? []
  if (!toolsets.includes("terminal")) {
    fail("hermes capability-demo: requires_toolsets missing 'terminal' (from `shell`)")
  }
  // Required service issue-tracker is gated (provisional name) AND has an env-var
  // entry — asserted structurally, never by exact var name (D9).
  if (!tools.includes("issue-tracker") && !toolsets.includes("issue-tracker")) {
    fail("hermes capability-demo: required 'issue-tracker' not gated in requires_tools/requires_toolsets")
  }
  // required_environment_variables is TOP-LEVEL frontmatter (D9 — confirmed
  // against the live harness), a sibling of metadata, not nested under hermes.
  const envVars = (cd.data.required_environment_variables as Record<string, unknown>[]) ?? []
  if (envVars.length < 1) {
    fail("hermes capability-demo: expected a top-level required_environment_variables entry for issue-tracker")
  }
  if ("required_environment_variables" in cdMeta) {
    fail("hermes capability-demo: required_environment_variables must be top-level, not under metadata.hermes (D9)")
  }
  for (const entry of envVars) {
    for (const key of ["name", "prompt", "help", "required_for"]) {
      if (!(key in entry)) fail(`hermes capability-demo: required_environment_variables entry missing '${key}'`)
    }
  }
  // Pre-flight sentinel + the full required-capability enumeration the D3 template
  // emits (shell/terminal included).
  if (!cd.body.includes(HERMES_SENTINEL)) fail("hermes capability-demo: missing pre-flight sentinel")
  for (const cap of ["terminal", "shell", "network", "subagents", "filesystem", "issue-tracker"]) {
    if (!cd.body.includes(cap)) fail(`hermes capability-demo: pre-flight does not name required capability '${cap}'`)
  }
  // (5) Description preserved verbatim (by value) — re-parsed value byte-equals
  //     source. The fixture description contains a colon to exercise reflow.
  const srcDesc = sourceByName.get("capability-demo")?.description
  if (cd.data.description !== srcDesc) {
    fail(`hermes capability-demo: description not preserved verbatim\n  source:  ${srcDesc}\n  emitted: ${cd.data.description}`)
  }
  info("[c] OK — capability-demo: full mapping + env-var shape + pre-flight + verbatim description")

  // (4) Optional service is NOT gated — `shared-memory?` appears in no
  //     requires_*/fallback_* key; only as a pre-flight advisory line (D4).
  const gatedValues = [
    ...toolsets,
    ...tools,
    ...((cdMeta.fallback_for_toolsets as string[]) ?? []),
    ...((cdMeta.fallback_for_tools as string[]) ?? []),
  ].map(String)
  if (gatedValues.includes("memory") || gatedValues.some((v) => v.includes("shared-memory"))) {
    fail("hermes capability-demo: optional 'shared-memory?' must not appear in any requires_*/fallback_* key (D4)")
  }
  if (!cd.body.includes("shared-memory")) {
    fail("hermes capability-demo: optional 'shared-memory' should appear as a pre-flight advisory line (D4)")
  }
  info("[c] OK — optional shared-memory ungated (advisory-only)")

  // (7) Robustness — a well-formed unrecognized `requires` key (legacy `tools:`)
  //     and a well-formed out-of-vocab service token do not abort the run and
  //     emit ungated-with-warning. (Malformed YAML is expected to fail loudly
  //     upstream — not asserted here; see Design § malformed YAML.)
  const robustSrc = path.join(robustRoot, "skills-src")
  const robustSkillDir = path.join(robustSrc, "robust-skill")
  fs.mkdirSync(robustSkillDir, { recursive: true })
  fs.writeFileSync(
    path.join(robustSkillDir, "SKILL.md"),
    [
      "---",
      "name: robust-skill",
      "description: Robustness fixture with a legacy key and an out-of-vocab service token.",
      "requires:",
      "  tools: [bash]                 # unrecognized §3 key — ignored with a warning",
      "  services: [nonexistent-role]  # well-formed out-of-vocab token — ungated with a warning",
      "---",
      "",
      "# Robust skill",
      "",
      "Body.",
      "",
    ].join("\n"),
    "utf8",
  )
  const robustHome = path.join(robustRoot, "home")
  const robustProc = Bun.spawnSync(
    ["bun", "run", "src/index.ts", "convert", robustSrc, "--to", "hermes", "--hermes-home", robustHome],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  )
  if (robustProc.exitCode !== 0) {
    fail(`hermes robustness: run aborted on well-formed-but-non-conformant input (exit ${robustProc.exitCode})`)
  }
  const robustFile = path.join(robustHome, "skills", "robust-skill", "SKILL.md")
  if (!fs.existsSync(robustFile)) fail("hermes robustness: expected an emitted (ungated) package")
  const rb = parseSkillFile(robustFile)
  const rbMeta = hermesMeta(rb.data)
  if (rbMeta.requires_toolsets || rbMeta.requires_tools || rbMeta.required_environment_variables) {
    fail("hermes robustness: expected ungated output (no gating keys) for unrecognized/out-of-vocab input")
  }
  if (rb.body.includes(HERMES_SENTINEL)) fail("hermes robustness: unexpected pre-flight (no required capability declared)")
  info("[c] OK — robust to unrecognized key + out-of-vocab service (ungated, no abort)")
} finally {
  // (8) Temp-dir hygiene — created with mkdtemp, removed in finally.
  fs.rmSync(hermesHome, { recursive: true, force: true })
  fs.rmSync(robustRoot, { recursive: true, force: true })
}

info(
  `✓ SMOKE TEST PASSED — ingestion (${parsedSkillCount} skills) + ${converted.target} conversion + hermes target green`,
)
process.exit(0)
