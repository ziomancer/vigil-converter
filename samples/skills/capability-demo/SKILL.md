---
name: capability-demo
description: Example skill whose frontmatter declares portable capability requirements.
requires:
  services: [issue-tracker?, shared-memory?]   # '?' marks an optional capability
  tools: [bash]
---

# Capability Demo

A second sample skill. Its frontmatter carries a `requires:` capability
declaration — a portable, converter-agnostic key — to confirm the block
round-trips through the YAML parser without special handling.

## Steps

1. Declare the capabilities the skill needs.
2. Let the host harness enforce them at pre-flight.
