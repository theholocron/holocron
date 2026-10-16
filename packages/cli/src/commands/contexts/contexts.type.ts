/**
 * Every command's **execution context** — the single source of truth for
 * how much of a repo a command needs around it to do its job.
 *
 * `npm i -g @theholocron/cli` gives you the binary and nothing else: no
 * `holocron.config`, no plugin packages. A large slice of the command
 * surface is fine with that; the rest needs a repo, and a few need the
 * provider plugins resolvable as well. Tagging each command lets the CLI
 *
 *   1. fail a `workspace` command **gracefully** when the plugins can't be
 *      resolved (see {@link ../plugin/workspace.js}), instead of leaking a
 *      raw `Cannot find package '@theholocron/holocron-plugin-*'`, and
 *   2. group `holocron --help` / the docs by what a bare global install
 *      actually gets you.
 *
 * Spec: `docs/wiki/specifications/tech-cli-execution-contexts.spec.md`
 * (theholocron/holocron#576). Shared with the interactive-menu registry
 * (theholocron/holocron#438).
 */

export type ExecutionContext = "global" | "repo-aware" | "workspace";
