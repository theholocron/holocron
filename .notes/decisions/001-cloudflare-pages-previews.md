# ADR 001 — Cloudflare Pages for PR preview deployments

**Date:** 2026-08-26
**Status:** Accepted
**Deciders:** Newton
**Context:** theholocron/holocron#420

---

## Context

The org's docs and Storybook sites deploy to GitHub Pages on every push to
`main`. GitHub Pages provides one live environment per repo — there is no
native per-PR preview URL. Reviewers cannot see rendered docs changes
before a merge.

Three options were evaluated:

| Option | Mechanism | Effort | PR previews | Cost |
| ------ | --------- | ------ | ----------- | ---- |
| GitHub Pages subdirectory hack | Deploy each PR to `gh-pages/pr/<n>/` | Medium | Yes (custom URL) | Free |
| Vercel | `vercel/action` or `@theholocron/holocron-plugin-vercel` | Low | Yes (auto) | Free tier; team tier for orgs |
| **Cloudflare Pages** | `cloudflare/pages-action` | Low | Yes (auto + PR comment) | Free |

---

## Decision

**Use Cloudflare Pages for per-PR preview deployments.**

---

## Rationale

### Why not GitHub Pages subdirectories?

- Pollutes the `gh-pages` branch with PR-specific directories that require
  manual cleanup or a dedicated cleanup workflow.
- Preview URLs are non-obvious and not posted automatically — they require
  constructing the URL in a workflow `run:` step and posting it via a separate
  `actions/github-script` call.
- The branch is a shared, mutable artifact; concurrent PRs can corrupt it if
  two jobs run simultaneously.

### Why not Vercel?

Vercel is already in the stack as the `deployment` provider for full Next.js
app deployments (`@theholocron/holocron-plugin-vercel`). However:

- **Scope mismatch.** Vercel is configured for application deployments
  (Next.js, Astro apps) with server-side rendering, databases, and env vars.
  The docs sites are fully static outputs — there is no runtime, no database,
  no edge functions. Vercel's feature set is overkill.
- **Org pricing.** Vercel's free tier limits to 1 concurrent build and
  doesn't support custom domains on preview deployments for teams. The org
  plan is $240/month per seat and not yet adopted.
- **Separation of concerns.** Keeping static-site previews on Cloudflare Pages
  and app production deploys on Vercel gives each service a clear role. Mixing
  static and dynamic deployments in the same Vercel project adds noise to
  deployment history and makes billing harder to attribute.

### Why Cloudflare Pages?

1. **Already in the stack.** Cloudflare is the org's DNS provider. The
   `@theholocron/holocron-plugin-cloudflare` package exists, and the team
   already manages API tokens for it. Adding Pages is a natural extension.

2. **Zero-config PR previews.** `cloudflare/pages-action` detects a
   `pull_request` event, creates a named preview deployment, and posts the URL
   as a PR comment automatically — no extra steps.

3. **Generous free tier.** Unlimited sites, unlimited requests, 500 builds/month
   on the free plan. Static docs are well within this envelope.

4. **SHA-pinned action.** `cloudflare/pages-action` is maintained by Cloudflare
   and provides a stable release (`v1.5.0`, SHA `f0a1cd…`). The action is
   pinned to the commit SHA per the org's workflow security policy.

5. **Config ergonomics.** One extra key in the existing `deploy.with` config —
   `preview: { project: "..." }` — is all that's needed. No new workflow entry,
   no duplication of build config.

---

## Consequences

- **Positive:** PR authors and reviewers get a unique preview URL posted as a
  comment on every push. No branch management required.
- **Positive:** Production GitHub Pages deploy is completely unaffected — it's
  a separate workflow triggered only on `main` push.
- **Positive:** Cloudflare Pages free tier handles the org's static site volume
  with headroom to spare.
- **Negative:** Preview deployments persist after PR close. Cloudflare's
  retention is 90 days. Manual cleanup is possible via the dashboard or API;
  automated cleanup is out of scope for this ADR.
- **Negative:** Requires two Cloudflare secrets in every repo that opts in
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Org-level secrets can
  mitigate this if all repos share the same Cloudflare account.
- **Operational:** The Cloudflare Pages project must be created manually in the
  dashboard before first deploy. This is a one-time step per repo.
