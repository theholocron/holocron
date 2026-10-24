import { listStoredProviders } from "../../auth/index.js";
import { env } from "../../env/index.js";
import type { OptionPrompt } from "../../ui/index.js";
import type { CommandEntry } from "./command-registry.type.js";

const numeric = (value: string): boolean | string => (/^\d+$/.test(value) ? true : "enter a number");

// Shared between package publish's "steady-state" and "initial" modes
// (holocron#1052 follow-up) -- otp's handler reads it the same way either
// way (cli.ts's resolveOtp), and both modes offer the same tag semantics.
const PUBLISH_TAG_OPTION: OptionPrompt = {
	key: "tag",
	flag: "--tag",
	type: "input",
	message: "npm dist-tag (blank = alpha for a bootstrap publish, latest otherwise):",
};
const PUBLISH_OTP_OPTION: OptionPrompt = {
	key: "otp",
	flag: "--otp",
	type: "password",
	secret: true,
	// Collected last, right before the real spawn -- a dry run never
	// checks it (npm publish itself is never called), and a TOTP code
	// typed any earlier risks going stale before it's actually used
	// (holocron#1052 follow-up).
	askLast: true,
	// HOLOCRON_NPM_ENFORCE_2FA is personal to the operator's own npm account, not
	// repo config -- someone else publishing from this same repo may have
	// no 2FA enforced at all. Set it (in your own shell profile, not
	// checked in anywhere) if your account always needs an OTP, to skip
	// checking this box every single run; it's still collected last,
	// exactly as if you'd picked it from the checkbox yourself.
	required: Boolean(env.get("HOLOCRON_NPM_ENFORCE_2FA")),
	message: "One-time password (2FA), if npm requires it for this publish:",
};

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
		name: "notifications channel add",
		description: "Create a notification channel, optionally with a webhook whose URL is stored as a secret",
		positionals: [{ key: "name", message: "Channel name:", type: "input" }],
		supportsDryRun: true,
	},
	{
		name: "doctor notifications",
		description: "Check the layout against the server and the secrets store, step by step (read-only)",
		positionals: [],
		supportsDryRun: false,
	},
	{
		name: "notifications setup",
		description: "Apply the server layout a notifications provider declares in holocron.config.ts",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "notifications link",
		description: "Link your server account to your GitHub account by signing in with the provider",
		positionals: [],
		supportsDryRun: true,
	},
	{
		name: "notifications sync-roles",
		description: "Make who holds a server role match a team, through the links file",
		positionals: [],
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
		// Three mutually exclusive workflows, not independent flags
		// (holocron#1052 follow-up) -- modes instead of a flat options list
		// + `when` so nothing contingent on a different mode is ever shown
		// (a flat checkbox can't warn when a picked option turns out to be
		// irrelevant to another pick in the same pass).
		modes: [
			{
				key: "steady",
				message: "Publish a new version",
				options: [
					PUBLISH_TAG_OPTION,
					PUBLISH_OTP_OPTION,
					{
						key: "provenance",
						flag: "--provenance",
						type: "confirm",
						default: true,
						negatable: true,
						message: "Publish with --provenance? (on by default)",
					},
					{
						key: "skipAlreadyPublished",
						flag: "--skip-already-published",
						type: "confirm",
						default: false,
						message: "Skip a package already published at this exact version, instead of one bulk publish?",
					},
				],
			},
			{
				key: "initial",
				message: "Initial publish (--initial)",
				description: "Use only for a package's very first publish.",
				flag: "--initial",
				options: [PUBLISH_TAG_OPTION, PUBLISH_OTP_OPTION],
			},
			{
				key: "syncTrust",
				message: "Sync Trusted Publisher workflow filename across every public package (--sync-trust)",
				options: [
					{
						key: "syncTrust",
						flag: "--sync-trust",
						type: "input",
						arity: 2,
						required: true,
						message: "Workflow filename (old, then new)",
					},
					{
						key: "repo",
						flag: "--repo",
						type: "input",
						message: "owner/repo for Trusted Publisher config (blank = theholocron/holocron):",
					},
				],
			},
		],
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
