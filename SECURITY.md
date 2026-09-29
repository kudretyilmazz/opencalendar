# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub's **"Report a vulnerability"** button (Security tab → Advisories). Include:

- the affected version or commit,
- steps to reproduce or a proof of concept,
- the impact you expect (data exposure, account takeover, etc.).

We aim to acknowledge reports within **3 business days** and to ship a fix or mitigation for high and critical issues within **30 days**. We'll credit you in the release notes unless you'd rather stay anonymous.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (latest minor) | ✅ security fixes |
| < 1.0 (pre-releases) | ❌ upgrade to 1.x |

Security fixes are released as patch versions of the latest 1.x minor. Upgrading within 1.x is
"pull the new image and restart" (migrations run automatically, see
[self-hosting](docs/03-architecture/self-hosting.md#upgrades)).

## Scope

In scope: this repository's application code, the official Docker image and the default configuration.
Out of scope: vulnerabilities in self-hosted infrastructure you control (reverse proxies, databases), social engineering, and denial of service through volume alone.

## How we protect users

See [docs/03-architecture/security.md](docs/03-architecture/security.md): CSP with per-request nonces, encrypted integration credentials (AES-256-GCM), hashed tokens, rate limiting and account lockout, authorization checks in every server action, and dependency/container scanning in CI.
