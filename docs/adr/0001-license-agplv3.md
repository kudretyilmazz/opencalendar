# ADR-0001: License OpenCalendar under AGPLv3, no "enterprise edition" split

The whole codebase, including team and enterprise-lite features, is licensed AGPL-3.0-only.

Last updated: 2026-09-28

- **Status:** Accepted
- **Date:** 2026-09-28
- **Related:** [../01-research/calcom.md](../01-research/calcom.md), [../01-research/calendly.md](../01-research/calendly.md)

## Context

- In April 2026 Cal.com moved its production code to a private repository. The public fork,
  Cal.diy, was relicensed from AGPLv3 to MIT and lost teams, round robin, routing forms,
  workflows, SSO, insights and API v1. Its README says it is for personal, non-production use.
- Before that, Cal.com used an "open core" split: AGPLv3 core plus a commercial `ee/` directory
  that needed `CALCOM_LICENSE_KEY`. Self-hosters reported that API v2 failed to start or broke
  login when the key was missing or expired.
- OpenCalendar is self-host-first. The features that matter most to organizations (round robin,
  collective, routing, workflows, webhooks, SSO) are exactly the ones that are now closed.
- A permissive license (MIT/Apache) would let a hosted competitor take the code closed again,
  which is the situation this project exists to fix.

## Decision

- License the entire repository under **AGPL-3.0-only**. There is no `ee/` directory, no license
  key and no feature gated by license checks.
- Contributions are accepted under the **Developer Certificate of Origin (DCO)** (`Signed-off-by`),
  not a CLA that would allow relicensing.
- Network use triggers source disclosure (AGPL section 13): the app shows a "Source" link in the
  footer pointing to `SOURCE_URL` (defaults to the upstream repository), so operators who modify
  the code can point it at their fork. Admins may hide the footer link (ADM-011); it then points to
  `/about`, which always offers the source at `SOURCE_URL` (ADR-0007).
- Embeds and the public REST API are interfaces, not derived works; client code that only calls
  `/api/v1` or embeds the booking widget is not required to be AGPL. We state this in the FAQ.

## Consequences

### Positive

- Clear promise to users: every feature is open and self-hostable forever.
- Hosted forks must publish their modifications.
- No license-key code paths that can break a self-hosted install.

### Negative

- Some companies have policies against AGPL dependencies; they may avoid embedding our packages.
- No revenue from license keys. Sustainability must come from hosting, support or sponsorships.
- DCO without CLA means we can never relicense to a proprietary license (intended).

### Follow-ups

- Add `LICENSE` (full AGPLv3 text), SPDX headers optional, `CONTRIBUTING.md` with DCO rules.
- Check every dependency for AGPL compatibility in CI (license scanner).

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| MIT / Apache-2.0 | Maximum adoption | Allows closed hosted forks, repeats the Cal.com story | Conflicts with project goal |
| AGPL core + commercial EE | Revenue path | License-key friction, community distrust, split codebase | Exactly the pain we are solving |
| BSL / source-available | Protects hosting business | Not OSI open source | Undermines "open-source alternative" claim |
| GPLv3 | Copyleft | No network clause, SaaS forks can stay closed | AGPL closes that gap |
