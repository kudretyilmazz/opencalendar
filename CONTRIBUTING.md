# Contributing to OpenCalendar

Thanks for helping! This guide gets you from clone to pull request.

## Setup

See [docs/04-development/setup.md](docs/04-development/setup.md). Short version:

```bash
npm install
npm run services:up        # PostgreSQL (5433) + Mailpit (8025)
cp .env.example .env       # then set AUTH_SECRET and ENCRYPTION_KEY
npm run dev                # http://localhost:3000 (runs migrations and an inline worker)
```

## Before you open a PR

```bash
npm run lint
npm run typecheck
npm test                   # unit + integration (needs Docker for Testcontainers)
npm run test:e2e           # Playwright against the running dev server
```

- Follow [conventions](docs/04-development/conventions.md) and the [testing strategy](docs/04-development/testing.md). Write tests first.
- Reference requirement IDs from [requirements.md](docs/02-product/requirements.md) in commits and PRs, e.g. `feat(auth): magic link sign-in (AUTH-002)`.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- Update docs in the same PR when behavior changes. Architecture decisions get an [ADR](docs/adr/README.md).

## Licensing

OpenCalendar is licensed under the [AGPL-3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.

## Code of conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).
