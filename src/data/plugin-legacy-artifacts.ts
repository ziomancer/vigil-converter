import type { CodexBundle } from "../types/codex"
import type { CopilotBundle } from "../types/copilot"
import type { DroidBundle } from "../types/droid"
import type { ClaudePlugin } from "../types/claude"
import type { GeminiBundle } from "../types/gemini"
import type { KiroBundle } from "../types/kiro"
import type { OpenCodeBundle } from "../types/opencode"
import type { PiBundle } from "../types/pi"
import { sanitizePathName } from "../utils/files"
import { normalizeCodexName } from "../utils/codex-content"

type LegacyPluginArtifacts = {
  skills?: string[]
  agents?: string[]
  commands?: string[]
}

const EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN: Record<string, LegacyPluginArtifacts> = {
}

export type LegacyTargetArtifacts = {
  skills: string[]
  prompts: string[]
}

export type LegacyTargetFileArtifacts = {
  skills: string[]
  agents: string[]
  commands: string[]
}

export type LegacyDroidArtifacts = {
  skills: string[]
  commands: string[]
  droids: string[]
}

export type LegacyOpenCodeArtifacts = {
  skills: string[]
  commands: string[]
  agents: string[]
}

export type LegacyKiroArtifacts = {
  skills: string[]
  agents: string[]
}

export type LegacyCopilotArtifacts = {
  skills: string[]
  agents: string[]
}

export type LegacyWindsurfArtifacts = {
  skills: string[]
  workflows: string[]
}

export function getLegacyPluginArtifacts(pluginName?: string): LegacyPluginArtifacts {
  if (!pluginName) return {}
  return EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN[pluginName] ?? {}
}

export function getLegacyCodexArtifacts(bundle: CodexBundle): LegacyTargetArtifacts {
  // IMPORTANT: legacy detection for the flat `~/.codex/skills/<name>` and
  // `~/.codex/prompts/<name>.md` paths must be driven exclusively by the
  // explicit historical allow-list in `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN`.
  //
  // Earlier versions of this function also seeded candidates from the current
  // plugin bundle (`bundle.skillDirs`, `bundle.generatedSkills`, `bundle.agents`).
  // That was unsafe: on a first install, any user-authored skill at a flat
  // `~/.codex/skills/<name>` path that happened to share a name with a current
  // CE skill or agent would be swept into `compound-engineering/legacy-backup`
  // even though it was never part of CE.
  //
  // The historical allow-list already enumerates every skill/agent/command name
  // CE has ever shipped (including names that are still current), so restricting
  // detection to that list still cleans up real legacy installs without
  // touching unrelated user skills.
  const skills = new Set<string>()
  const prompts = new Set<string>()
  const currentPromptFiles = new Set<string>()

  for (const prompt of bundle.prompts) {
    currentPromptFiles.add(`${sanitizePathName(prompt.name)}.md`)
  }

  const extras = getLegacyPluginArtifacts(bundle.pluginName)
  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { includeRawColon: true })
  }
  for (const name of extras.agents ?? []) {
    skills.add(normalizeCodexName(name))
  }
  for (const name of extras.commands ?? []) {
    const normalized = normalizeCodexName(name)
    skills.add(normalized)
    const promptFile = `${normalized}.md`
    if (!currentPromptFiles.has(promptFile)) {
      prompts.add(promptFile)
    }
  }

  return {
    skills: [...skills].sort(),
    prompts: [...prompts].sort(),
  }
}

export function getLegacyPiArtifacts(bundle: PiBundle): LegacyTargetArtifacts {
  const skills = new Set<string>()
  const prompts = new Set<string>()
  const currentSkills = new Set<string>([
    ...bundle.generatedSkills.map((skill) => normalizePiName(skill.name)),
    ...bundle.skillDirs.map((skill) => normalizePiName(skill.name)),
  ])
  const currentPromptFiles = new Set<string>()

  for (const prompt of bundle.prompts) {
    currentPromptFiles.add(`${sanitizePathName(prompt.name)}.md`)
  }

  const extras = getLegacyPluginArtifacts(bundle.pluginName)
  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { currentSkills })
  }
  for (const name of extras.agents ?? []) {
    const skillName = normalizePiName(name)
    if (!currentSkills.has(skillName)) {
      skills.add(skillName)
    }
  }
  for (const name of extras.commands ?? []) {
    const promptFile = `${normalizePiName(name)}.md`
    if (!currentPromptFiles.has(promptFile)) {
      prompts.add(promptFile)
    }
  }

  return {
    skills: [...skills].sort(),
    prompts: [...prompts].sort(),
  }
}

export function getLegacyGeminiArtifacts(bundle: GeminiBundle): LegacyTargetFileArtifacts {
  const skills = new Set<string>()
  const agents = new Set<string>()
  const commands = new Set<string>()
  const currentSkills = new Set<string>([
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
  ])
  const currentAgents = new Set<string>((bundle.agents ?? []).map((agent) => `${sanitizePathName(agent.name)}.md`))
  const currentCommands = new Set<string>(bundle.commands.map((command) => `${command.name}.toml`))
  const extras = getLegacyPluginArtifacts(bundle.pluginName)

  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { currentSkills })
  }
  for (const name of extras.agents ?? []) {
    const skillName = normalizeLegacyName(name)
    if (!currentSkills.has(skillName)) {
      skills.add(skillName)
    }
    const agentPath = `${skillName}.md`
    if (!currentAgents.has(agentPath)) {
      agents.add(agentPath)
    }
  }
  for (const name of extras.commands ?? []) {
    const commandPath = toNestedCommandRelativePath(name, ".toml")
    if (!currentCommands.has(commandPath)) {
      commands.add(commandPath)
    }
  }

  return {
    skills: [...skills].sort(),
    agents: [...agents].sort(),
    commands: [...commands].sort(),
  }
}

export function getLegacyDroidArtifacts(bundle: DroidBundle): LegacyDroidArtifacts {
  const skills = new Set<string>()
  const commands = new Set<string>()
  const droids = new Set<string>()
  const currentSkills = new Set<string>(bundle.skillDirs.map((skill) => sanitizePathName(skill.name)))
  const currentCommands = new Set<string>(bundle.commands.map((command) => `${command.name}.md`))
  const currentDroids = new Set<string>(bundle.droids.map((droid) => `${sanitizePathName(droid.name)}.md`))
  const extras = getLegacyPluginArtifacts(bundle.pluginName)

  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { currentSkills })
  }
  for (const name of extras.agents ?? []) {
    const droidPath = `${normalizeLegacyName(name)}.md`
    if (!currentDroids.has(droidPath)) {
      droids.add(droidPath)
    }
  }
  for (const name of extras.commands ?? []) {
    const commandPath = `${flattenLegacyCommandName(name)}.md`
    if (!currentCommands.has(commandPath)) {
      commands.add(commandPath)
    }
  }

  return {
    skills: [...skills].sort(),
    commands: [...commands].sort(),
    droids: [...droids].sort(),
  }
}

export function getLegacyOpenCodeArtifacts(bundle: OpenCodeBundle): LegacyOpenCodeArtifacts {
  const skills = new Set<string>()
  const commands = new Set<string>()
  const agents = new Set<string>()
  const currentSkills = new Set<string>(bundle.skillDirs.map((skill) => sanitizePathName(skill.name)))
  const currentCommands = new Set<string>(bundle.commandFiles.map((command) => toRawCommandRelativePath(command.name, ".md")))
  const currentAgents = new Set<string>(bundle.agents.map((agent) => `${sanitizePathName(agent.name)}.md`))
  const extras = getLegacyPluginArtifacts(bundle.pluginName)

  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { currentSkills })
  }
  for (const name of extras.agents ?? []) {
    const agentPath = `${sanitizePathName(name)}.md`
    if (!currentAgents.has(agentPath)) {
      agents.add(agentPath)
    }
  }
  for (const name of extras.commands ?? []) {
    const commandPath = toRawCommandRelativePath(name, ".md")
    if (!currentCommands.has(commandPath)) {
      commands.add(commandPath)
    }
  }

  return {
    skills: [...skills].sort(),
    commands: [...commands].sort(),
    agents: [...agents].sort(),
  }
}

export function getLegacyKiroArtifacts(bundle: KiroBundle): LegacyKiroArtifacts {
  const skills = new Set<string>()
  const agents = new Set<string>()
  const currentSkills = new Set<string>([
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
  ])
  const currentAgents = new Set<string>(bundle.agents.map((agent) => sanitizePathName(agent.name)))
  const extras = getLegacyPluginArtifacts(bundle.pluginName)

  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { currentSkills })
  }
  for (const name of extras.agents ?? []) {
    const skillName = normalizeLegacyName(name)
    if (!currentSkills.has(skillName)) {
      skills.add(skillName)
    }
    const agentName = normalizeLegacyName(name)
    if (!currentAgents.has(agentName)) {
      agents.add(agentName)
    }
  }
  for (const name of extras.commands ?? []) {
    for (const skillName of legacyCommandSkillNames(name)) {
      if (!currentSkills.has(skillName)) {
        skills.add(skillName)
      }
    }
  }

  return {
    skills: [...skills].sort(),
    agents: [...agents].sort(),
  }
}

export function getLegacyCopilotArtifacts(bundle: CopilotBundle): LegacyCopilotArtifacts {
  const skills = new Set<string>()
  const agents = new Set<string>()
  const currentSkills = new Set<string>([
    ...bundle.generatedSkills.map((skill) => sanitizePathName(skill.name)),
    ...bundle.skillDirs.map((skill) => sanitizePathName(skill.name)),
  ])
  const currentAgents = new Set<string>(bundle.agents.map((agent) => `${sanitizePathName(agent.name)}.agent.md`))
  const extras = getLegacyPluginArtifacts(bundle.pluginName)

  for (const name of extras.skills ?? []) {
    addLegacySkillVariants(skills, name, { currentSkills })
  }
  for (const name of extras.agents ?? []) {
    const agentPath = `${normalizeLegacyName(name)}.agent.md`
    if (!currentAgents.has(agentPath)) {
      agents.add(agentPath)
    }
  }
  for (const name of extras.commands ?? []) {
    for (const skillName of legacyCommandSkillNames(name)) {
      if (!currentSkills.has(skillName)) {
        skills.add(skillName)
      }
    }
  }

  return {
    skills: [...skills].sort(),
    agents: [...agents].sort(),
  }
}

export function getLegacyWindsurfArtifacts(plugin: ClaudePlugin): LegacyWindsurfArtifacts {
  // IMPORTANT: legacy detection for Windsurf roots must be driven exclusively
  // by the explicit historical allow-list in `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN`.
  //
  // Earlier versions of this function also seeded candidates from the current
  // plugin bundle (`plugin.skills`, `plugin.agents`, `plugin.commands`). That
  // was unsafe: the Windsurf writer has since been removed, so the only
  // purpose of this cleanup is backing up stale files from past installs.
  // Any user-authored skill/workflow at a flat Windsurf path that happened to
  // share a name with a current CE skill/agent/command (e.g.
  // `skills/ce-debug` or `global_workflows/ce-plan.md`) would otherwise be
  // swept into `compound-engineering/legacy-backup` even though it was never
  // installed by CE.
  //
  // The historical allow-list already enumerates every skill/agent/command
  // name CE has ever shipped (including names that are still current), so
  // restricting detection to that list still cleans up real legacy installs
  // without touching unrelated user content. If the allow-list is empty for
  // this plugin, Windsurf cleanup is a no-op — the correct safety default.
  const skills = new Set<string>()
  const workflows = new Set<string>()
  const extras = getLegacyPluginArtifacts(plugin.manifest.name)

  for (const name of extras.skills ?? []) {
    skills.add(sanitizePathName(name))
  }
  for (const name of extras.agents ?? []) {
    skills.add(normalizeLegacyName(name))
  }
  for (const name of extras.commands ?? []) {
    workflows.add(`${normalizeLegacyName(name)}.md`)
  }

  return {
    skills: [...skills].sort(),
    workflows: [...workflows].sort(),
  }
}

function normalizePiName(value: string): string {
  return normalizeLegacyName(value)
}

function addLegacySkillVariants(
  skills: Set<string>,
  name: string,
  options: { currentSkills?: Set<string>; includeRawColon?: boolean } = {},
): void {
  const { currentSkills, includeRawColon = false } = options
  const sanitized = sanitizePathName(name)
  if (!currentSkills?.has(sanitized)) {
    skills.add(sanitized)
  }

  // Codex historically accepted raw colon directory names on macOS
  // (for example ~/.codex/skills/ce:plan). Other targets generally sanitized
  // these names, so raw-colon probing is target-specific.
  if (includeRawColon && name.includes(":") && !currentSkills?.has(name)) {
    skills.add(name)
  }
}

function normalizeLegacyName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return "item"
  const normalized = trimmed
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/[:\s]+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "item"
}

function flattenLegacyCommandName(value: string): string {
  const finalSegment = value.includes(":") ? value.split(":").pop()! : value
  return normalizeLegacyName(finalSegment)
}

function legacyCommandSkillNames(value: string): string[] {
  return [...new Set([normalizeLegacyName(value), flattenLegacyCommandName(value)])]
}

function toNestedCommandRelativePath(value: string, ext: string): string {
  return `${value.split(":").map((segment) => normalizeLegacyName(segment)).join("/")}${ext}`
}

function toRawCommandRelativePath(value: string, ext: string): string {
  const parts = value.split(":").map((segment) => sanitizePathName(segment))
  return `${parts.join("/")}${ext}`
}
