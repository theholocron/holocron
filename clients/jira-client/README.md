# @theholocron/jira-client

TypeScript client for the Jira REST API v2. Covers issues, versions, projects, links, transitions, and search.

## Installation

```bash
pnpm add @theholocron/jira-client
```

## Usage

```ts
import { createJiraClient } from "@theholocron/jira-client";

const jira = createJiraClient({
	host: "https://your-org.atlassian.net/rest/api/2",
	token: Buffer.from(`${email}:${apiToken}`).toString("base64"),
});

// Create a ticket
const issue = await jira.issues.create("Fix login bug", "Bug", "PROJ");

// Get multiple tickets
const issues = await jira.issues.getMany(["PROJ-1", "PROJ-2"]);

// Search with JQL
const results = await jira.issues.search({
	jql: "project = PROJ AND status = Open",
});

// Manage versions
const version = await jira.versions.create("v1.2.0", "PROJ");
await jira.versions.update(version.id, { released: true });
```

## API

- **`jira.issues`** — create, get, getMany, update, getProperty, search
- **`jira.versions`** — create, get, getMany, update, delete
- **`jira.projects`** — get
- **`jira.links`** — create, createMany, getLinkTypes
- **`jira.transitions`** — create, get, getResolutions

## Auth

Jira REST API v2 uses HTTP Basic auth with a base64-encoded `email:apiToken` string. Generate an API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

## License

GPL-3.0 © [Newton Koumantzelis](https://github.com/iamnewton)
