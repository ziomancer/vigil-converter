/**
 * Hermes target writer (VHS-20).
 *
 * Emits `<HERMES_HOME>/skills/<name>/SKILL.md` for each skill in the bundle and
 * copies the source's supporting subtrees (`references/`, `templates/`,
 * `scripts/`, `assets/`).
 *
 * Non-destructive of user content (Design § Writer mechanics): `<HERMES_HOME>/
 * skills/` is Hermes's single source of truth where agent-created and
 * user-edited skills live (wiki `skills-system.md:10,192`). The writer
 * overwrites the generated `SKILL.md` and additively copies subtrees via
 * `copySkillDir` — it never blanket-`rm`s the per-skill directory, so it cannot
 * delete a user's edited files under the same name. A blanket clean-replace is
 * acceptable only against a freshly-created / dedicated `HERMES_HOME` (e.g. the
 * CI temp home). Stale converter-orphan cleanup (the inherited install-manifest
 * mechanism) is a deliberately deferred enhancement — `kiro` is the
 * manifest-free structural sibling.
 */
import path from "path"
import { copySkillDir, ensureDir, sanitizePathName } from "../utils/files"
import { renderHermesSkillContent } from "../converters/claude-to-hermes"
import type { HermesBundle } from "../types/hermes"

export async function writeHermesBundle(
  outputRoot: string,
  bundle: HermesBundle,
  _scope?: string,
): Promise<void> {
  // `outputRoot` is the resolved Hermes profile home (Decision D6); skills live
  // under `<home>/skills/<name>/` (wiki `skills-system.md`).
  const skillsRoot = path.join(outputRoot, "skills")
  await ensureDir(skillsRoot)

  // Guard sanitized-name collisions: skip-with-warning rather than silently
  // overwrite a different skill. The pattern is borrowed from the OpenCode
  // *agent* guard (opencode.ts:94-101); the inherited skill loops lack it, so
  // the Hermes skill writer adds it. Cannot occur for the four distinct vigil
  // skill names, but the writer must be generic.
  const seen = new Set<string>()
  for (const skill of bundle.skills) {
    const safeName = sanitizePathName(skill.name)
    if (seen.has(safeName)) {
      console.warn(
        `Skipping skill "${skill.name}": sanitized name "${safeName}" collides with another skill`,
      )
      continue
    }
    seen.add(safeName)

    const targetDir = path.join(skillsRoot, safeName)
    // The generated SKILL.md must win, not the verbatim source. Passing a
    // transform makes copySkillDir rewrite SKILL.md (and copy supporting
    // subtrees verbatim) in one pass; `transformAllMarkdown=false` leaves
    // reference markdown untouched (Design § Writer mechanics).
    await copySkillDir(skill.sourceDir, targetDir, (raw) => renderHermesSkillContent(skill, raw), false)
  }
}
