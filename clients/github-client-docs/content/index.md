---
title: GitHub Client
description: TypeScript client for the GitHub REST API, built on @theholocron/http-client.
---

`@theholocron/github-client` is a typed wrapper around the GitHub REST API.

## Install

```bash
npm i @theholocron/github-client
```

## Usage

```ts
import { createGitHubClient } from "@theholocron/github-client";

const client = createGitHubClient({ token: process.env.GITHUB_TOKEN });

const repo = await client.repos.getRepo("owner/name");
const labels = await client.labels.listLabels("owner/name");
```

## Namespaces

| Namespace      | Methods                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branches`     | `protectBranch`                                                                                                                                                                                         |
| `environments` | `listEnvironments`, `upsertEnvironment`, `deleteEnvironment`                                                                                                                                            |
| `git`          | `getRef`, `getCommit`, `getTree`, `getContents`, `createBlob`, `createTree`, `createCommit`, `createRef`, `updateRef`, `createPull`                                                                     |
| `issues`       | `listIssues`, `getIssue`, `createIssue`, `updateIssue`, `addLabels`, `removeLabel`, `createComment`, `listMilestones`                                                                                   |
| `labels`       | `listLabels`, `createLabel`, `updateLabel`, `deleteLabel`                                                                                                                                               |
| `properties`   | `setProperties`                                                                                                                                                                                         |
| `repos`        | `getRepo`, `updateRepo`, `getContents`                                                                                                                                                                  |
| `rulesets`     | `listRulesets`, `createRuleset`, `updateRuleset`                                                                                                                                                        |
| `secrets`      | `listSecrets`, `getPublicKey`, `putSecret`, `deleteSecret`                                                                                                                                              |
| `security`     | `enableVulnerabilityAlerts`, `enableAutomatedSecurityFixes`, `enableSecretScanning`, `enablePrivateVulnerabilityReporting`, `enableDependencyGraph`, `enableCodeScanning`, `disableDefaultCodeScanning` |
| `teams`        | (see package)                                                                                                                                                                                           |
| `topics`       | `setTopics`                                                                                                                                                                                             |
| `user`         | `getCurrentUser`                                                                                                                                                                                        |
| `workflows`    | `listRuns`, `getRun`                                                                                                                                                                                    |
