# `@theholocron/linear-client`

TypeScript client for the [Linear GraphQL API](https://linear.app/developers).

## Install

```bash
pnpm add @theholocron/linear-client
```

## Usage

```ts
import { createLinearClient } from "@theholocron/linear-client";

const linear = createLinearClient({ token: process.env.LINEAR_API_KEY! });

const { user, organization } = await linear.teams.viewer();
const team = await linear.teams.find("ENG");
const states = await linear.teams.states(team!.id);

const issue = await linear.issues.create({ teamId: team!.id, title: "Fix the thing", priority: 2 });
await linear.issues.comment(issue.id, "On it.");
```

A personal API key (`lin_api_...`) is sent as is; an OAuth token (`lin_oauth_...`) is sent as a bearer.
`linear.graphql.query(document, variables)` is the raw handle for anything the groups do not cover.

## API

| Group      | Methods                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `teams`    | `viewer`, `list`, `find`, `automation`, `states`, `createState`, `labels`, `createLabel`, `users` |
| `issues`   | `list`, `get`, `create`, `update`, `comments`, `comment`, `relate`, `attach`, `attachmentsForUrl` |
| `projects` | `list`, `statuses`, `create`, `archive`, `unarchive`                                              |

Priority is Linear's own: 0 none, 1 urgent, 2 high, 3 medium, 4 low.

## License

MIT
