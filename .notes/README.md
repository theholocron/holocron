# In-progress specs

`.notes/*.spec.md` holds design specs that are still being drafted or under
discussion (`status: draft` / `proposed`). Every spec needs a companion GitHub
issue — the `issue:` frontmatter field references it.

A spec has an `id:` (`SPEC-0007`) too, but you do not pick it: `holocron specs sync` numbers a spec once it is on the
default branch, in the same pull request that links its discussion post. `holocron probe specs check` warns until then.

Once the design is settled, the spec **moves to
`docs/wiki/specifications/`**:

- `accepted` — living reference docs (process, architecture, documentation)
  whose decisions are in force.
- `archived` / `superseded` — the work shipped, or the exploration was dropped
  or replaced.

`holocron probe specs check` validates frontmatter in both directories (the
`adrs` job of `platform.repoValidation`).
