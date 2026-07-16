# @theholocron/github-client

TypeScript client for the GitHub REST API, built on `@theholocron/http-client`.

## Install

```bash
npm i @theholocron/github-client
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
