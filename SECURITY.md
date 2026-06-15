# Security Policy

## Supported Versions

Security fixes are applied to the latest version on `main`.

## Reporting a Vulnerability

Please do not open a public issue for undisclosed vulnerabilities.

Instead, report privately by emailing:
- `support@vigilharbor.com`

Include:
- A clear description of the issue
- Reproduction steps or proof of concept
- Impact assessment (what an attacker can do)
- Any suggested mitigation

We will acknowledge receipt as soon as possible and work with you on validation,
remediation, and coordinated disclosure timing.

## Scope Notes

This repository is a command-line converter that reads Claude Code `SKILL.md`
sources and emits per-harness packages. It is not a server process.

- The conversion process never executes skill content during conversion — see
  the **Supply chain & security posture** section of [README.md](README.md).
- Emitted packages are later executed by their target host runtime, not by this
  converter; their security depends on that host.
