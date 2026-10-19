import { listStoredProviders } from "../../auth/index.js";
import type { CommandEntry } from "./command-registry.type.js";

const numeric = (value: string): boolean | string => (/^\d+$/.test(value) ? true : "enter a number");

/**
 * The full command surface, hand-maintained in parallel with `cli.ts`'s
 * yargs registrations (this module does not introspect yargs at runtime).
 * `run <task>` has no entry here at all — `cli.ts`'s `$0` handler merges in
 * {@link buildRunMenuEntries}'s dynamically-built ones instead, since the
 * task namespace is this repo's own resolved manifest, not a static set
 * this module can hand-enumerate the way every other entry's positionals
 * are. `job` and `passthrough` stay un-prompted either way; picking a task
 * and running it plain covers the common case, and typing
 * `holocron run <task> <job> -- <args>` directly is one step away for
 * everything else. `run lint commit-msg <file>` stays excluded entirely:
 * it's invoked exclusively from `.husky/commit-msg "$1"`, never typed by a
 * human.
 */
export const COMMAND_REGISTRY: CommandEntry[] = [
	{
		name: "clone",
		description: "Clone a single repo (org/repo) or every repo in an org (org)",
		positionals: [
			{
				key: "target",
				message: "org/repo to clone (or a bare org to clone every repo in it):",
				type: "input",
				validate: (v) => v.trim().length > 0 || "org/repo or org is required",
			},
		],
		supportsDryRun: true,
	},
	{
		name: "doctor",
		description: "Load the config and run a smoke check against every provider",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo setup",
		description: "Apply infra setup actions across every configured capability",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "secrets set",
		description: "Set a single secret via the configured `secrets` capability",
		positionals: [{ key: "name", message: "Secret name:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "secrets sync",
		description: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
		positionals: [{ key: "environmentId", message: "Vault environment id:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "deploy",
		description: "Trigger a deployment via the configured `deployment` capability",
		positionals: [{ key: "branch", message: "Branch to deploy:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "deploy cleanup-preview",
		description: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
		positionals: [{ key: "pr", message: "PR number:", type: "input", validate: numeric }],
		supportsDryRun: true,
	},
	{
		name: "deploy on-release",
		description: "Deploy every workspace package whose delivery.deploy task is `on: release`",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "monitoring check",
		description: "Run every configured `monitoring` check against a given URL instead of its own configured url",
		positionals: [{ key: "url", message: "URL to test against:", type: "input" }],
		supportsDryRun: false,
	},
	// `monitoring resolve-checks`/`monitoring run-resolved` (holocron#1030/
	// #1032) are deliberately NOT registered here -- the two halves of the
	// delivery.previewCheck split, meant for CI, not a human navigating
	// `holocron monitoring` interactively. See
	// command-registry.test.ts's exclusion list.
	{
		name: "package bump-versions",
		description: "Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
		positionals: [{ key: "newVersion", cliArg: "new-version", message: "New version:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "package publish",
		description: "Publish @theholocron/* packages to npm",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo sync",
		description:
			"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "run ci",
		description: "Run the merge-gating checks locally, in CI order — 'will CI pass?'",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "sync github",
		description: "Sync workflow templates and composite actions to theholocron/.github",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo sync readme",
		description: "Sync the Installation + Usage block in README.md from package.json",
		positionals: [],
		supportsDryRun: true,
	},
	{ name: "config show", description: "Print the resolved holocron config", positionals: [] },
	{
		name: "new repo",
		description: "Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "new plugin",
		description: "Scaffold a new @theholocron/holocron-plugin-<slug> package",
		positionals: [
			{ key: "slug", message: "Package slug (kebab-case):", type: "input" },
			{ key: "vendor", message: "Vendor display name (PascalCase):", type: "input" },
		],
		supportsDryRun: true,
	},
	{
		name: "skills install",
		description: "Copy skills from @theholocron/skills into .agents/ with agent symlinks",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "skills remove",
		description: "Remove installed skills via npx skills remove",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "skills update",
		description: "Update installed skills to their latest upstream versions via npx skills update",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "repo upgrade node",
		description: "Scan the repo and update every Node.js version pin to a new major",
		positionals: [{ key: "to", message: "Target Node.js major version:", type: "input", validate: numeric }],
		supportsDryRun: true,
	},
	{
		name: "repo upgrade deps",
		description: "Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "auth set",
		description: "Verify + store a bootstrap token for a provider",
		positionals: [{ key: "provider", message: "Provider name:", type: "input" }],
	},
	{
		name: "auth unset",
		description: "Remove a stored bootstrap token",
		positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
	},
	{
		name: "auth check",
		description: "Re-verify a stored bootstrap token",
		positionals: [{ key: "provider", message: "Provider:", type: "select", choices: listStoredProviders }],
	},
	{
		name: "auth list",
		description: "List every provider with a stored bootstrap token",
		positionals: [],
	},
];

/** Look up a {@link CommandEntry} by its full name — for Layer 3 call sites in `cli.ts`. */
export function getEntry(name: string): CommandEntry {
	const entry = COMMAND_REGISTRY.find((e) => e.name === name);
	if (!entry) throw new Error(`interactive-menu: no COMMAND_REGISTRY entry named "${name}"`);
	return entry;
}
