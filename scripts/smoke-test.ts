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

info(`✓ SMOKE TEST PASSED — ingestion (${parsedSkillCount} skills) + ${converted.target} conversion green`)
process.exit(0)
