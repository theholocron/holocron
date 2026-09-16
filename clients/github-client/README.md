# @theholocron/github-client

TypeScript client for the GitHub REST API, built on `@theholocron/http-client`.

## Install

```bash
pnpm add @theholocron/github-client
```

## Usage

```ts
import { createGitHubClient } from "@theholocron/github-client";

const client = createGitHubClient({ token: process.env.GITHUB_TOKEN! });

// Repos
const repo = await client.repos.getRepo("owner/name");

// Labels
const labels = await client.labels.listLabels("owner/name");
await client.labels.createLabel("owner/name", {
  name: "bug",
  color: "d73a4a",
  description: "Something isn't working",
});

// Topics
await client.topics.setTopics("owner/name", ["cli", "nodejs"]);

// Git plumbing (blobs, trees, commits, refs, PRs)
const ref = await client.git.getRef("owner/name", "main");
const blob = await client.git.createBlob("owner/name", "file contents");
```

## Namespaces

| Namespace      | Methods                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`         | `getCurrentUser`                                                                                                                                                                                        |
| `repos`        | `getRepo`, `updateRepo`, `getContents`                                                                                                                                                                  |
| `security`     | `enableVulnerabilityAlerts`, `enableAutomatedSecurityFixes`, `enableSecretScanning`, `enablePrivateVulnerabilityReporting`, `enableDependencyGraph`, `enableCodeScanning`, `disableDefaultCodeScanning` |
| `rulesets`     | `listRulesets`, `createRuleset`, `updateRuleset`                                                                                                                                                        |
| `branches`     | `protectBranch`                                                                                                                                                                                         |
| `workflows`    | `listRuns`, `getRun`                                                                                                                                                                                    |
| `secrets`      | `listSecrets`, `getPublicKey`, `putSecret`, `deleteSecret`                                                                                                                                              |
| `environments` | `listEnvironments`, `upsertEnvironment`, `deleteEnvironment`                                                                                                                                            |
| `issues`       | `listIssues`, `getIssue`, `createIssue`, `updateIssue`, `addLabels`, `removeLabel`, `createComment`, `listMilestones`                                                                                   |
| `labels`       | `listLabels`, `createLabel`, `updateLabel`, `deleteLabel`                                                                                                                                               |
| `topics`       | `setTopics`                                                                                                                                                                                             |
| `properties`   | `setProperties`                                                                                                                                                                                         |
| `git`          | `getRef`, `getCommit`, `getTree`, `getContents`, `createBlob`, `createTree`, `createCommit`, `createRef`, `updateRef`, `createPull`                                                                     |

## Webhooks

GitHub's own inbound-webhook mechanics — signature verification and
header/payload shapes — as standalone functions, not part of
`createGitHubClient()`: these verify a _delivery this package's consumer
received_, not an outbound REST call, so they need a webhook secret
instead of an API token.

```ts
import {
  parseGitHubWebhookHeaders,
  verifyGitHubWebhookSignature,
  type GitHubPushWebhookPayload,
} from "@theholocron/github-client";

const { event, delivery, signature } = parseGitHubWebhookHeaders(req.headers);
const ok = verifyGitHubWebhookSignature({ body: rawBody, signature, secret: webhookSecret });
```

`verifyGitHubWebhookSignature({ body, signature, secret })` — `X-Hub-
Signature-256` verification (HMAC-SHA256 over the raw body,
`timingSafeEqual`-compared). Returns `false` for any failure to verify
(empty secret, missing/malformed signature, mismatch) — never throws;
the caller decides how to surface that.

`parseGitHubWebhookHeaders(headers)` — extracts `event`, `delivery`, and
`signature` from GitHub's three webhook headers, case-insensitively.

`GitHubInstallationWebhookPayload`, `GitHubPushWebhookPayload`,
`GitHubPullRequestWebhookPayload` — the delivery body shapes, scoped to
the fields a consumer reads today (not a full re-typing of every field
GitHub sends).

A consumer owns what to _do_ with a verified delivery — which event
categories matter, how to normalize them into its own domain shape.
`@theholocron/sentinel`'s `parseWebhookEvent()` is the reference
consumer.
