import type { OrgConfig } from "@theholocron/cli";

// The organization's constants (SPEC-0069, #1820). `domain` is the org's DNS zone, the one place it is spelled: the
// loader sets it on a config that leaves `domain` out, and a file that builds a hostname before the loader runs
// (`holocron.config.ts`, `notifications.ts`, `apps/sentinel/holocron.config.ts`) imports this file for it. The rest are
// provider options, filled into a provider entry that leaves the option out of `holocron.config.ts`. Identifiers
// only, never a secret. NOT here: anything CI needs (`CLOUDFLARE_ACCOUNT_ID`, `TURBO_TEAM`, `HOLOCRON_AXIOM_DATASET`); those
// live in 1Password and sync to a GitHub variable (`repo.variables.sync` in `.holocron/repo.ts`), and nothing else
// carries a copy. A value set here and inline in the config is an error. This area is shared: a config in a
// subdirectory (`apps/sentinel`) reads this file too, and its own `.holocron/org.ts` overrides a key set in both
// (#1829). Keep this file plain data with a type-only import: Sentinel evaluates it remotely, and importers need no
// runtime code from it.
const domain = "theholocron.dev";

export default {
	domain,
	cloudflare: { zone: domain },
	checkly: { accountId: "fb82859a-4f62-4773-8404-db0f29f9262c" },
	sentry: { org: "theholocron" },
	// The organization's issue Types (SPEC-0106, #2512). Bug, Feature and Task already exist in the organization; their
	// descriptions and colours below are PLACEHOLDERS (GitHub's defaults, from memory) to be replaced from a live read
	// (`holocron apply issue-types --dry-run`) before anything runs with `--update`. Epic and Spike are the new ones.
	// `label` is the Linear label that stands for the Type; `commit` is the Conventional Commit type `start work` uses
	// (none for Epic and Spike, so the issue title's own prefix, else `chore`, applies).
	issueTypes: [
		{ name: "Bug", description: "An unexpected problem or behavior", color: "red", label: "bug", commit: "fix" },
		{
			name: "Feature",
			description: "A request, idea, or new functionality",
			color: "blue",
			label: "enhancement",
			commit: "feat",
		},
		{ name: "Task", description: "A specific piece of work", color: "yellow", label: "chore", commit: "chore" },
		{ name: "Epic", description: "A body of work made of several issues", color: "purple", label: "epic" },
		{
			name: "Spike",
			description: "Time-boxed research that ends in a finding, not a change",
			color: "orange",
			label: "spike",
		},
	],
} satisfies OrgConfig;
