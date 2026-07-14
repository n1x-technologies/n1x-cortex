# Security Policy

## Supported versions

N1X Cortex follows semantic versioning. Only the latest published minor
release line receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/n1x-technologies/n1x-cortex/security/advisories/new):

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, affected version, and reproduction steps.

We aim to acknowledge reports within 5 business days and to ship a fix or
mitigation for confirmed, in-scope vulnerabilities as promptly as severity
warrants. Coordinated disclosure is appreciated: please give us reasonable
time to release a fix before any public write-up.

## Scope

In scope: the `@n1x-technologies/cortex` package (CLI, local viewer, MCP
server) in `toolkit/`. Cortex runs locally and never sends vault content off
the machine; findings that involve data exfiltration, arbitrary file write
outside the vault, or code execution from untrusted vault content are
especially relevant.

Out of scope: vulnerabilities in third-party dependencies already tracked
upstream (report those to the dependency), and issues requiring a
pre-compromised local machine.

— N1X Technologies
