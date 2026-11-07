<!-- editorconfig-checker-disable-file -->

# `@theholocron/holocron-plugin-linear`

Linear plugin for [Holocron](../../cli/cli). Implements the `issues` and `projects` capabilities against the
[Linear GraphQL API](https://linear.app/developers), and `export` / `import` on `issues` so `holocron migrate` can move
issues between Linear and GitHub in either direction.

## Install

<!-- prettier-ignore -->
```bash
pnpm add -D @theholocron/holocron-plugin-linear
```

## Auth

1. `--token <KEY>` on the holocron invocation
2. `HOLOCRON_LINEAR_TOKEN`
3. `LINEAR_API_KEY`
4. keyring `linear` (set with `holocron auth set linear <KEY>`)

Create a personal API key at **Linear → Settings → Account → Security**.

## Config

<!-- prettier-ignore -->
```ts
providers: {
  issues: ["linear", { team: "ENG", states: { inProgress: "In Progress", inReview: "In Review" } }],
  projects: ["linear", { team: "ENG" }],
}
```

`team` (the team key) is required. `states` names the states the `inProgress` and `inReview` lifecycle slots move an
issue to; left out, the team's first `started` state is used.

## Not the same as GitHub

Linear does not match GitHub feature for feature: statuses are per team, there are no custom fields or managed views,
automation is read-only, and priority is built in. The full table, and what it means for a migration back to GitHub, is
on the [plugin docs page](../../docs/src/content/docs/plugins/linear.mdx). A migration lists what it could not carry
at the end of every run.
