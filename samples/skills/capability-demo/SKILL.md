---
name: capability-demo
description: "Example skill: declares portable capability requirements exercising every contract section-3 branch."
requires:
  shell: true
  filesystem: [read, write]
  network: true
  subagents: true
  services: [issue-tracker, shared-memory?]   # issue-tracker REQUIRED+credentialed; shared-memory optional ('?')
---

# Capability Demo

A sample skill whose frontmatter carries a contract-conformant `requires:`
capability declaration — a portable, converter-agnostic key. It drives every
portability-contract §3 mapping branch so the Hermes adapter's CI smoke path
exercises the full table:

- `shell: true` → `terminal` toolset + hard pre-flight.
- `filesystem`, `network`, `subagents` → pre-flight only (no Hermes gating key).
- `services: issue-tracker` → required, credentialed (MCP-backed tool + env var).
- `services: shared-memory?` → optional (`?`): advisory-only, never gated.

## Steps

1. Declare the capabilities the skill needs.
2. Let the host harness enforce the required ones at pre-flight before mutating state.
3. Treat optional services as warn-and-proceed.
