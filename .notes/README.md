# In-progress specs

`.notes/*.spec.md` holds design specs that are still being drafted or under
discussion (`status: draft` / `proposed`). Every spec needs a companion GitHub
issue — the `issue:` frontmatter field references it.

Once the design is settled, the spec **moves to
`docs/wiki/specifications/`**:

- `accepted` — living reference docs (process, architecture, documentation)
  whose decisions are in force.
- `archived` / `superseded` — the work shipped, or the exploration was dropped
  or replaced.

`scripts/validate-adrs.mjs` validates frontmatter in both directories (runs in
the Lint workflow).
