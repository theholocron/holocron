---
status: archived # draft → proposed (issue filed) → approved (milestone attached) → archived
issue:
blocked-by: []
---

<!-- editorconfig-checker-disable-file -->

# Vault provider — swap 1Password for Doppler + Infisical (both cloud)

> **Decision.** Build **two** vault plugins:
> `@theholocron/holocron-plugin-doppler` **first**
> (hand-written, informs #77 template refinement), then
> `@theholocron/holocron-plugin-infisical` **using
> `holocron plugin create` once #77 Phase 1 ships** — proves the
> new CLI works via real usage. Both target the vendors' **free
> cloud tiers**; **Infisical self-host is rejected** (numbers in
> the Options section). Downstream users flip between the two by
> changing one line in `holocron.config.json` — exactly the swap
> the capability/provider model was built for.

## Context

- The `vault` capability is the only REQUIRED capability, so this
  choice touches every downstream flow: `holocron setup`,
  `holocron secrets sync`, `holocron secret set`, `doctor`.
- Today `holocron-plugin-1password` is the only CLI-transport
  plugin in the repo. See `packages/holocron-plugin-1password/src/`.
  It shells out to `op` with `stdio: ['inherit', ...]` so
  biometric prompts work locally. In CI the flow degrades to
  service-account token via env.
- Swapping vault providers is exactly the swap the
  capability/provider model was built for — write a new plugin
  implementing `vault`, flip it in `holocron.config.json`, done.
  Every other capability (source/ci/secrets/deployment/etc.) keeps
  working unchanged.

## Requirements

Ranked by what actually matters for this project:

1. **REST-first API.** No desktop-app dependency, no biometric-TTY
   dance. Should work identically on a laptop and in CI. Removing
   the only CLI-transport plugin means every plugin is REST, which
   simplifies `holocron plugin create` templates (see #77 Phase 1).
2. **Secret grouping** — some notion of project / env / namespace so
   `secrets sync` can pull "all secrets for `holocron-prod`" in one
   call rather than N round-trips.
3. **Free personal tier or open-source.** This is a personal OSS
   project, not a business.
4. **Machine tokens** with narrow scope for CI use.
5. **Existing sync integrations to GitHub / Vercel** are a bonus
   but NOT required — the whole point of holocron is that our own
   `secrets sync` flow handles that.
6. **Webhooks / audit log** — nice-to-have, not required.

## Options

### Doppler (current lean)

- **API**: REST, well-documented, project/config model matches what
  we need.
- **Pricing**: free "Developer" tier covers personal use — 5 users,
  unlimited projects, unlimited secrets.
- **Auth**: service tokens per project/config, easy to scope for CI.
- **Downsides**: SaaS-only (no self-host). Company acquisition risk
  (personal-tier features could get pulled behind a paywall).
- **Plugin shape**: standard REST plugin. Auth precedence
  `--token → HOLOCRON_DOPPLER_TOKEN → DOPPLER_TOKEN`. Base URL
  `https://api.doppler.com/v3`.

### Infisical cloud (also chosen — second plugin)

- **API**: REST, open-source, generous free hosted tier.
- **Auth**: machine identities with granular scopes.
- **Plugin shape**: standard REST plugin. Same auth precedence
  pattern. Base URL configurable so cloud and (theoretical future)
  self-host use the same plugin binary.
- **Why also build it**: gives the operator a real choice via
  `holocron.config.json`. Also exercises `holocron plugin create`
  end-to-end — building the second vault plugin with the new CLI
  is the acceptance test for #77 Phase 1.

### Infisical self-host (rejected)

Numbers surfaced by fetching their current self-host docs:

- **Containers**: 3 (backend + Postgres + Redis).
- **Minimum specs**: 2 CPU / 4 GB RAM.
- **Setup time**: 5–10 min local, +30–60 min for a real reachable
  deploy with TLS.
- **Ongoing cost**: ~$10–15/mo on a VPS (Fly / Railway / DO), or a
  homelab box with an inbound tunnel so CI can reach it.
- **Ongoing maintenance**: postgres backups, container upgrades,
  cert renewal — all become the operator's problem. A broken
  migration mid-upgrade blocks every downstream flow that depends
  on `vault`.

For a personal OSS project, paying $120–180/yr and adopting a
database-you-babysit to avoid a lock-in risk that (a) hasn't
materialized and (b) is escapable in under an hour via the
Migration Path section is a bad trade. If Doppler ever squeezes
its free tier, we already have the Infisical cloud plugin
built — flip config, done. If Infisical cloud _also_ goes bad,
that's the moment to spin up self-host — not now.

### sops + age (dark horse)

- **API**: none — it's a file format. Encrypted `.env`-style files
  committed to the repo, decrypted at read time with an `age` key.
- **Pricing**: free forever, no SaaS, no infra.
- **Auth**: file-based key. Backup via password manager / hardware
  token.
- **Downsides**: no central rotation, no audit log, key management
  is entirely on the operator. Secrets-sync becomes "read encrypted
  file → push to GitHub/Vercel," which is fine but different from
  the API-fetch pattern the other plugins use.
- **Plugin shape**: unusual — no `rest.ts`; reads local file,
  shells out to `sops` binary (which is another CLI-transport
  plugin, ironic given the goal of ditching that pattern).
- **Verdict**: rejected for now. Solves storage but not the
  laptop-and-CI-symmetric-access problem cleanly.

### Bitwarden Secrets Manager

- **API**: REST, separate product from Bitwarden Password Manager.
- **Pricing**: free personal tier exists but is limited.
- **Auth**: machine access tokens.
- **Downsides**: newer product, smaller ecosystem, fewer
  integrations. Docs less polished than Doppler / Infisical.
- **Verdict**: not compelling relative to Doppler / Infisical
  unless we're already invested in the Bitwarden ecosystem.

### 1Password (status quo)

- Works today. Fine for personal use. But: CLI-transport, biometric
  TTY, desktop-app dependency. The `gh` tool talking to 1Password
  for auth is exactly the friction that motivated this question.
- **Verdict**: keep working, plan to migrate — but not urgent.

## Migration path

Regardless of which we pick:

1. Build `@theholocron/holocron-plugin-doppler` (or `-infisical`) via
   `holocron plugin create` (once #77 Phase 1 ships).
2. Populate the target vault by dumping 1Password → pushing to new
   vault. One-time script, throw away after.
3. Update `holocron.config.json` — flip `vault` from `1password` to
   the new plugin.
4. Verify with `holocron doctor` + a full `secrets sync` dry-run.
5. Retire 1P as _this repo's_ default — but keep the plugin package
   published + maintained for any downstream project that prefers
   1Password's biometric-first UX (see #96).

The migration is intentionally reversible — the old plugin package
stays available on npm, and secrets are dumped before the cutover.

## Roadmap

Sequenced deliberately — Doppler is hand-written first so its
shape informs #77's template refinement; Infisical is built via
the new CLI so #77 gets a real-world acceptance test.

- **Phase 1**: Build `@theholocron/holocron-plugin-doppler`
  (hand-written, using the `holocron-plugin` skill for guidance).
  Standard REST plugin, `vault` capability, auth precedence
  `--token → HOLOCRON_DOPPLER_TOKEN → DOPPLER_TOKEN`, base URL
  `https://api.doppler.com/v3`. Ship as its own PR.
- **Phase 2**: Ship #77 Phase 1 (`holocron plugin create` REST-only).
  See `.notes/tool-plugin-create.spec.md`.
- **Phase 3** (shipped): Built `@theholocron/holocron-plugin-infisical`
  via `holocron plugin create infisical Infisical --capability vault
--vendor-env INFISICAL_TOKEN --base-url https://app.infisical.com/api`.
  Same plugin shape, Infisical's REST API. Doubled as the first
  real production use of #77's CLI — 17 files scaffolded, gate
  green from the get-go, only the vault capability methods needed
  filling in. Filed as #97.
- **Phase 4**: Migrate this repo's own `holocron.config.json`
  vault from `1password` to `doppler` (or `infisical` — operator
  choice). Dump secrets from 1Password, push to chosen vault, flip
  config, verify with `holocron doctor` + a `secrets sync` dry-run.
- **Phase 5** (later, no rush): Retire 1P as _this repo's_ default
  — narrow, doc-focused polish tracked in #96. The plugin package
  itself STAYS published + maintained; anyone who prefers 1P's
  biometric UX in their own project can still `pnpm add
@theholocron/holocron-plugin-1password` and go.

## Downstream consequences

Because the 1P plugin STAYS alive (issue #96 clarified scope), the
implications for #76 / #78 are the OPPOSITE of what an earlier draft
of this spec suggested:

- **#76** (per-plugin `transport` option) — 1P remains the reference
  CLI-transport plugin, so #76 keeps its concrete grounding.
- **#78** (CLI-transport sibling skill) — same reason; 1P is the
  working example a CLI-transport skill would point at.

Nothing to close speculatively.

## Open questions

1. **Timing relative to v2.0.0 stable.** Options:
    - **(a)** Ship Phases 1–4 as part of v2.0.0 stable — clean cutover,
      v2 launches on Doppler, no 1Password baggage.
    - **(b)** Ship v2.0.0 stable on 1Password (current alpha state),
      do Phases 1–4 as v2.1.
    - Leaning **(a)** if Doppler plugin comes together fast; **(b)**
      if it drags. Decide after Phase 1's PR lands.
