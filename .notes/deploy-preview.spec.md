---
status: in-progress
issues:
  - theholocron/clients#300
  - theholocron/holocron#419
  - theholocron/holocron#420
blocked-by: []
---

# Deploy preview — Cloudflare Pages per-PR previews

Enable per-PR preview deployments of documentation and Storybook sites using
Cloudflare Pages alongside the existing GitHub Pages production deploy.

---

## Motivation

The existing `deploy` workflow deploys docs/Storybook to GitHub Pages on every
push to `main`. GitHub Pages supports exactly one live environment per repo, so
there is no way to preview a pending PR's docs changes before merging.

Cloudflare Pages solves this out of the box: every deployment gets a unique
preview URL, and `cloudflare/pages-action` posts that URL as a PR comment
automatically when `gitHubToken` is provided.

---

## Goals

- Single opt-in flag per repo — `preview: true` in the existing `deploy.with`
  config. No second workflow entry, no duplication of docs/storybook config.
- Defaults derived automatically: `project = "<org>-preview"`,
  `domain = "preview.<docs.domain>"`.
- One `deploy.yml` thin caller handles both production (push → GitHub Pages)
  and preview (pull_request → Cloudflare Pages).
- Preview URLs: `<repo>-pr-<n>.preview.theholocron.dev` via a wildcard custom
  domain set up once for the org.
- DNS + Pages custom domain provisioned automatically by `holocron setup`.
- Template repos are excluded — no `preview:` in their configs.

## Non-goals

- Full Vercel-style app deployment platform.
- Preview deletion after PR close (CF Pages 90-day retention; cleanup out of scope).

---

## Config

```ts
// Minimal — both project and domain derived from config.org + config.docs.domain
{ name: "deploy", with: { docs: true, preview: true } }

// Storybook too
{ name: "deploy", with: { docs: true, storybook: [{ name: "ui", path: "packages/ui" }], preview: true } }

// Explicit override (project only — domain still derived)
{ name: "deploy", with: { docs: true, preview: { project: "custom-preview" } } }

// Fully explicit
{ name: "deploy", with: { docs: true, preview: { project: "p", domain: "preview.example.dev" } } }
```

`preview: true` resolves using the repo's `holocron.config.ts`:
- `project` = `${config.org}-preview`
- `domain` = `preview.${config.docs.domain}`

Repos without `preview:` get the unmodified push-only `deploy.yml` thin caller.

---

## Preview URL

All repos share one Cloudflare Pages project (e.g., `theholocron-preview`).
The `branch` input to `cloudflare/pages-action` is set to
`${{ github.event.repository.name }}-pr-${{ github.event.pull_request.number }}`.

With `*.preview.theholocron.dev` as a wildcard custom domain on the shared project:

```
clients PR #42  → clients-pr-42.preview.theholocron.dev
docs PR #15     → docs-pr-15.preview.theholocron.dev
utils PR #7     → utils-pr-7.preview.theholocron.dev
```

DNS: one wildcard CNAME `*.preview.theholocron.dev → theholocron-preview.pages.dev`
set up once at the org level.

---

## Generated thin caller

`holocron setup` and `sync-github` generate a single `deploy.yml` for repos
with `preview:` that contains two jobs with `if:` guards:

```yaml
on:
  push:       { branches: [main] }   # → GitHub Pages (production)
  pull_request: { branches: [main] } # → Cloudflare Pages (preview)
  workflow_dispatch:

concurrency:
  group: ${{ github.event_name == 'pull_request' && format('...') || 'pages' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  deploy:   { if: "github.event_name != 'pull_request'", uses: deploy.yml@main }
  preview:  { if: "github.event_name == 'pull_request'", uses: deploy-preview.yml@main }
```

---

## Required CI secrets

Add to the repo (or org) under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
| ------ | ------- |
| `CLOUDFLARE_API_TOKEN` | API token with **Cloudflare Pages: Edit** scope |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (dashboard home page sidebar) |

---

## Implementation

### 1. `@theholocron/cloudflare-client` (theholocron/clients#300)

New `pages` namespace on `createCloudflareClient`:

| Method | API |
| ------ | --- |
| `listProjects(accountId)` | `GET /accounts/{id}/pages/projects` |
| `getProject(accountId, name)` | `GET /accounts/{id}/pages/projects/{name}` |
| `createProject(accountId, input)` | `POST /accounts/{id}/pages/projects` |
| `updateProject(accountId, name, patch)` | `PATCH /accounts/{id}/pages/projects/{name}` |
| `createDeployment(accountId, projectName, branch)` | `POST /accounts/{id}/pages/projects/{name}/deployments` |
| `getDeployment(accountId, projectName, deploymentId)` | `GET /accounts/{id}/pages/projects/{name}/deployments/{id}` |
| `listDomains(accountId, projectName)` | `GET /accounts/{id}/pages/projects/{name}/domains` |
| `addDomain(accountId, projectName, hostname)` | `POST /accounts/{id}/pages/projects/{name}/domains` |

### 2. `@theholocron/holocron-plugin-cloudflare` (theholocron/holocron#419)

New `CloudflareDeployment` class implementing the `Deployment` capability:

- `listProjects` / `ensureProject` — idempotent project create
- `listEnvVars` / `setEnvVar` — per-target (preview/production) env vars via `deployment_configs` PATCH
- `triggerDeployment` — branch deploy; returned id encoded as `projectName:cfDeploymentId`
- `getDeployment` — decodes `projectName:cfDeploymentId` to fetch
- `ensureCustomDomain` — idempotent: list existing, POST only if absent

`accountId` required for all `deployment` methods. The `dns` capability continues to work without it.

`Deployment` interface extended with optional `ensureCustomDomain?(projectId, hostname)`.

### 3. CLI (theholocron/holocron#420)

#### `setup-workflows.ts`

- `PreviewConfig` — `{ project: string; domain?: string }`
- `OrgContext` — `{ org?: string; docsDomain?: string }` for defaulting
- `extractPreviewConfig(raw, ctx)` — handles `preview: true`, `preview: { project }`, fully explicit
- `generateCombinedDeployContent(deployWith, paths, preview)` — produces the two-job thin caller YAML
- `normalizeWorkflowWith` — strips `preview` before injecting into the production job's `with:`
- `KNOWN_WORKFLOWS` — excludes `deploy-preview` (internal; triggered as side-effect)

#### `setup.ts`

- When `deploy` entry has `preview:`: call `extractPreviewConfig` with `config.org` / `config.docs?.domain` as context, write combined `deploy.yml`
- After `deployment.ensureProject`: call `deployment.ensureCustomDomain?.(project, "*.${domain}")` and `dns.upsertRecord(domain, { CNAME ... })` when `preview.domain` is set

#### `sync-github.ts`

- `parseOrgContextFromTs(source)` — regex-extracts `org` and `docs.domain` from `holocron.config.ts`
- `buildBatch` — receives `orgContext`, passes to `extractPreviewConfig` when processing `deploy` entries

#### Workflow templates

- `templates/workflows/deploy-preview.yml` — reusable in `.github`; builds docs+storybook, deploys with `cloudflare/pages-action@v1.5.0` (SHA-pinned); branch overridden to `<repo>-pr-<n>` for URL routing
- `commands/workflows/deploy-preview.yml` — standalone thin caller template (users who need it explicitly)

---

## Rollout

1. Merge `theholocron/clients#300` and publish `@theholocron/cloudflare-client@1.12.x`
2. Bump clients catalog in `holocron/pnpm-workspace.yaml`
3. Merge `theholocron/holocron#419` (plugin) and `#420` (CLI) — can be one PR
4. For first repo opting in:
   a. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as org secrets
   b. Create the Pages project at dash.cloudflare.com (or let `holocron setup` create it)
   c. Add `preview: true` to the deploy `with:` in `holocron.config.ts`
   d. Run `holocron setup` — provisions project, custom domain, DNS record
   e. For subsequent repos: just add `preview: true` and run `holocron setup`
