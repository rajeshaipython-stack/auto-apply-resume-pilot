# Contributing to ResumePilot MCP

Thanks for your interest! ResumePilot is designed to grow through **adapters**,
so most contributions don't touch the core.

## Development setup

```bash
npm install
npm run build
npm test          # 40 tests
npm run demo      # offline end-to-end run
```

## Non-negotiable rules

1. **Never invent resume content.** Any code path that could add a skill,
   experience, qualification or metric the user didn't provide is a bug. New
   logic must go through the verified-keyword set.
2. **Never store passwords or OTPs.** Integrations use official OAuth/session
   flows; tokens go to secure storage, never to logs or the repo.
3. **Never bypass** CAPTCHA / 2FA / bot protection / authentication. Human-only
   steps pause for the user.
4. **Respect** each source's terms, robots and rate limits. Prefer official APIs.
5. **Test every core service.** Add/extend Vitest tests with your change.

## Adding a job source (Phase 2/3)

Implement `JobSourceAdapter` in `src/providers/jobs/`, declare honest
`capabilities`, and register it in `registry.ts`. Do not modify the pipeline.

## Adding an application adapter (Phase 4)

Implement `ApplicationAdapter` in `src/providers/applications/`. `submit()` may
only auto-submit where technically and legally supported, and must pause for any
human-only step.

## Adding an email provider (Phase 5)

Implement `EmailProvider` in `src/providers/email/` (read-only scope preferred).

## Commit / PR

- Keep PRs focused; describe user-facing impact.
- `npm run build && npm test` must pass; CI runs on Node 18/20/22 across OSes.
