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
4. keyring `linear` (set with `holocron new token linear <KEY>`)

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

## Setup and doctor

`holocron provider linear setup` makes what the `issues` entry declares and `holocron provider linear doctor` compares
it with the team, one row per setting. Setup is idempotent, never deletes, supports `--dry-run` and asks first unless
`--yes`. Names only, no secrets:

<!-- prettier-ignore -->
```ts
issues: ["linear", {
  team: "ENG",
  labels: ["bug", "enhancement"],                   // made on the team when missing
  project: "Roadmap",                               // made when missing
  automation: {
    autoClose: { months: 3, state: "Canceled" },    // teamUpdate: autoClosePeriod / autoCloseState
    autoArchive: { months: 6 },                     // teamUpdate: autoArchivePeriod
    git: [                                          // rules by event (and exact branch)
      { event: "start", state: "In Progress" },
      { event: "merge", state: "Done", branch: "main" },
    ],
  },
  templates: [{ name: "Bug report", file: ".holocron/linear/bug.md" }],  // validated; reported as skipped
}],
```

Changing team settings needs a key with admin access to the team. Git automation is made and compared (events `draft`, `review`,
`start`, `mergeable`, `merge`). Issue templates are validated but reported as skipped: Linear does not document the issue
`templateData` shape, so a template can be neither written nor compared with certainty.

## Not the same as GitHub

Linear does not match GitHub feature for feature: statuses are per team, there are no custom fields or managed views,
automation is read-only, and priority is built in. The full table, and what it means for a migration back to GitHub, is
on the [plugin docs page](../../docs/src/content/docs/plugins/linear.mdx). A migration lists what it could not carry
at the end of every run.
