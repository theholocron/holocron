# `@theholocron/sentry-client`

TypeScript client for the [Sentry management API](https://docs.sentry.io/api/).

This is the **management API** client for provisioning Sentry projects and
retrieving DSNs — not the error-capture SDK. For runtime error reporting use
`@sentry/node` directly.

## Install

```bash
pnpm add @theholocron/sentry-client
```

## Usage

```ts
import { createSentryClient } from "@theholocron/sentry-client";

const sentry = createSentryClient({ token: process.env.SENTRY_AUTH_TOKEN! });

// List accessible organizations (also useful for token verification)
const orgs = await sentry.auth.organizations();

// Get a specific organization
const org = await sentry.auth.getOrg("my-org");

// List projects in an org
const projects = await sentry.projects.list("my-org");

// Get a project by slug
const project = await sentry.projects.get("my-org", "my-project");

// Create a project under a team
const newProject = await sentry.projects.create("my-org", "my-team", {
  name: "my-project",
  platform: "node",
});

// Retrieve client keys (DSNs) for a project
const keys = await sentry.projects.keys("my-org", newProject.slug);
const dsn = keys[0].dsn.public;

// Custom (internal) integrations, and the alert rules (workflows) that send to them
const apps = await sentry.sentryApps.list("my-org");
const app = await sentry.sentryApps.create("my-org", {
  name: "Comlink",
  scopes: ["event:read"],
  webhookUrl: "https://comlink.example.dev/sentry",
  isAlertable: true,
});
const installs = await sentry.sentryApps.installations("my-org"); // installs[0]?.app.sentryAppId is what an alert action points at
const detectors = await sentry.workflows.detectors("my-org"); // an `issue_stream` detector per project
await sentry.workflows.create("my-org", {
  name: "Errors to Discord",
  enabled: true,
  environment: null,
  config: { frequency: 5 },
  detectorIds: detectors.filter((d) => d.type === "issue_stream").map((d) => d.id),
  triggers: {
    logicType: "any-short",
    conditions: [] /* e.g. a "first seen" condition */,
  },
  actionFilters: [
    {
      logicType: "any-short",
      conditions: [],
      actions: [] /* a sentry_app action */,
    },
  ],
});
```

## Auth

Generate an [auth token](https://sentry.io/settings/account/api/auth-tokens/)
with the required scopes:

| Operation                | Required scopes                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| List orgs / verify token | `org:read`                                                                               |
| List / get projects      | `project:read`                                                                           |
| Create projects          | `project:write`                                                                          |
| List / get integrations  | `org:read`                                                                               |
| Create / update one      | `org:write`, and every scope you give the integration                                    |
| Read its `clientSecret`  | every scope the integration itself has (Sentry hides the secret from a token with fewer) |
| List / get alert rules   | `alerts:read`                                                                            |
| Create / update one      | `alerts:write`                                                                           |

The token is passed directly or read from `SENTRY_AUTH_TOKEN`.

> **Note:** This is a user-scoped or org-scoped _auth token_, not the
> project-level _DSN token_ your app embeds at runtime. Those are outputs
> of `projects.keys()`, not inputs to this client.
