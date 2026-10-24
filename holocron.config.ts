import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { nodeDocs } from "@theholocron/holocron-config";

// nodeDocs() provides: org, domain, docs, strict repo protection, the base
// providers (source, ci, issues, deployment, dns, workers). Per D13
// (epic #672 / .notes/tech-holocron-platform.spec.md): the preset's `tasks`
// and task-derived `extraRequiredChecks` still speak the pre-decomposition
// vocabulary (`lint`, `test`, `typecheck`, `deploy`, plain `"audit /
// Conclusion"`) — theholocron/configs hasn't caught up to #675 yet, and
// doesn't need to for this repo to move (D13: it's a convenience preset,
// not a required dependency). This repo declares its own intent-facing
// tasks directly instead of spreading `presetTasks`/`presetChecks`.
const { repo, providers, org, domain, docs } = nodeDocs();

export default defineConfig({
	description:
		"A pluggable, capability-based CLI for spinning up and operating software projects — your own infrastructure-as-tool.",
	homepage: "https://docs.theholocron.dev/holocron/",
	org,
	domain,
	docs,
	repo: {
		...repo,
		teams: [{ slug: "gatekeepers", permission: "maintain" }],
		topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
		// GitHub's default branch was still main while all v2 alpha work lands
		// on alpha (CLAUDE.md's Releases section) -- Sentinel's validateConfig()
		// only ever reads a repo's default branch (D6, a security boundary),
		// so it's been silently validating main's stale pre-#675-vocabulary
		// holocron.config.ts instead of what's actually being developed.
		// Revert to "main" (or drop this field) once alpha merges to main for
		// the v2.0.0 stable cut and stops being the active branch.
		defaultBranch: "alpha",
	},
	// Required status checks not backed by a `{ required: true }` task.
	// `holocron repo setup` appends these to the task-derived contexts from
	// `astromech.requiredChecks()`. codecov/patch + codecov/project are
	// project-wide gates; the rest are repo-specific. The old preset's
	// "audit / Conclusion" is gone — the decomposed audit tasks
	// (sourceQuality.deadCodeAnalysis, delivery.bundleSize, in
	// astromech.config.ts) each derive their own context automatically now
	// that they're real `{ required: true }` task entries, not a
	// preset-supplied extra.
	extraRequiredChecks: [
		"codecov/patch",
		"codecov/project",
		"codecov/patch/astromech",
		"codecov/patch/cli",
		"codecov/patch/datapad",
		"codecov/patch/holocron-plugin-1password",
		"codecov/patch/holocron-plugin-axiom",
		"codecov/patch/holocron-plugin-clerk",
		"codecov/patch/holocron-plugin-cloudflare",
		"codecov/patch/holocron-plugin-fern",
		"codecov/patch/holocron-plugin-discord",
		"codecov/patch/holocron-plugin-doppler",
		"codecov/patch/holocron-plugin-github",
		"codecov/patch/holocron-plugin-infisical",
		"codecov/patch/holocron-plugin-neon",
		"codecov/patch/holocron-plugin-posthog",
		"codecov/patch/holocron-plugin-postman",
		"codecov/patch/holocron-plugin-sentry",
		"codecov/patch/holocron-plugin-slack",
		"codecov/patch/holocron-plugin-vercel",
		"Platform / Compliance / Run Holocron config compatibility",
		"Platform / Commit Standards / Run commitlint",
		"Source Quality / Formatting / Run editorconfig",
		"Source Quality / Static Analysis / Run eslint",
		"Source Quality / Documentation / Run markdownlint",
	],
	// The decomposed intent vocabulary (epic #672, D3/#675) — what used to be
	// `nodeDocs()`'s bundled `lint` (8 linters) is now 5 separately-gated
	// tasks; `typecheck`/`test`/`deploy` are renamed 1:1. `security`/`review`/
	// `stale`/`greetings`/`dependencies`/`bookkeeping` aren't part of the
	// task-name vocabulary (workflow-only keys, unaffected by the rename).
	// The repo-specific tasks (the decomposed audit tasks, platform.
	// repoValidation, delivery.publish, platform.repoSync, knowledge.wiki)
	// and `syncScripts: false` live in `astromech.config.ts` and are merged
	// in by astromech's `loadTasksConfig`.
	tasks: [
		{ name: "sourceQuality.staticAnalysis", required: true },
		{ name: "sourceQuality.formatting", required: true },
		{ name: "sourceQuality.structuredDataValidation", required: true },
		{ name: "security.secretDetection", required: true },
		{ name: "platform.commitStandards", required: true },
		{ name: "verification.unitTests", required: true },
		"security.codeScanning",
		"review",
		"stale",
		"greetings",
		"dependencies",
		"bookkeeping",
		{ name: "verification.typeSafety", required: true },
		// knowledge.docs implies docs: true — this repo has no Storybook, so
		// the dedicated task is more idiomatic than delivery.deploy + with:
		// { docs: true } now that the two mean the same thing (astromech.ts).
		{ name: "knowledge.docs", with: { preview: true } },
	],
	providers: {
		...providers,
		secrets: "github",
		// Environments: manage GitHub deployment environments for staging/production
		environments: "github",
		// Errors: Sentry — `holocron repo setup` provisions the project and pushes the
		// DSN to repo secrets. Runtime error reporting (observability/telemetry.ts) is independent
		// and always on via the built-in DSN; this entry is for the setup surface.
		errors: ["sentry", { org: "theholocron" }],
		// Logs: Axiom aggregation — setup provisions the holocron-ci / holocron-local datasets
		logs: "axiom",
		// Notifications: the Holocron Discord server. `holocron notifications setup`
		// applies the layout below (idempotent; --dry-run previews it). This block
		// lives in ONE repo on purpose -- a server layout is org-level, so it must
		// not sit in a shared preset that every repo would then apply. Each webhook
		// URL is stored straight into the org secret HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>
		// (never printed). Needs HOLOCRON_DISCORD_BOT_TOKEN (the Holonet bot).
		notifications: [
			"discord",
			{
				guildId: "1303969001822486568",
				layout: {
					// Every webhook wears the Holocron mark. PNG, because that is what Discord accepts.
					webhookAvatar: "media/webhook-avatar.png",
					// Keep ordinary members from pinging the whole server.
					everyone: { deny: ["MentionEveryone"] },
					// The bot's own page in the developer portal. These match what is set there today. There is no
					// `install`: Discord only allows an install link on a public bot, and this one is private.
					application: {
						description:
							"The messenger for The Holocron. It posts releases, deploys, repo syncs and alerts from GitHub Actions into the right channel. It also sets up the server's channels, webhooks and roles so a new community starts from a known layout, and keeps maintainer roles in step with the GitHub team.",
						tags: ["automation", "notifications", "devops", "developer tools", "github"],
						termsUrl: "https://docs.theholocron.dev/holocron/legal/terms/",
						privacyUrl: "https://docs.theholocron.dev/holocron/legal/privacy/",
						// Lists who is in the server, which `sync-roles` needs to find who holds a role.
						intents: { members: true },
					},
					// Where `notifications link` signs members in: Sentinel when it answers, otherwise this machine.
					links: { hostedUrl: "https://sentinel.theholocron.dev" },
					categories: [
						{
							name: "START HERE",
							// Read-only for everyone: these channels are posted to by the bot and by owners.
							access: { post: [] },
							channels: [
								{ name: "welcome", topic: "What this server is and how to get help" },
								{ name: "rules", topic: "How we treat each other here" },
							],
						},
						{
							name: "ALERTS",
							// Webhooks and the bot post here; nobody needs to.
							access: { post: [] },
							channels: [
								{
									name: "alerts",
									topic: "Anything that needs a human: failed runs, PRs to merge by hand",
									webhook: true,
								},
								{ name: "errors", topic: "Errors from Sentinel and Sentry", webhook: true },
								{ name: "uptime", topic: "Monitoring up/down", webhook: true },
							],
						},
						{
							name: "AUTOMATION",
							access: { post: [] },
							channels: [
								{ name: "releases", topic: "Each lockstep release across the org", webhook: true },
								{
									name: "deploys",
									topic: "Sentinel and Vercel deploys, Preview Check results",
									webhook: true,
								},
								{ name: "sync", topic: "Repo-sync PRs and template pushes", webhook: true },
							],
						},
						{
							name: "STAFF",
							// Hidden from everyone but gatekeepers (and server administrators, whom Discord never hides
							// anything from). Discord's own community notices land here.
							access: { view: ["gatekeepers"] },
							channels: [
								{
									name: "community-updates",
									topic: "Notices from Discord about the server (staff only)",
								},
							],
						},
						{
							name: "BUILD",
							channels: [
								{ name: "dev", topic: "Day-to-day building talk" },
								{ name: "ideas", topic: "Half-formed ideas and things to spec later" },
							],
						},
					],
					// What a new member sees on joining.
					welcome: {
						description: "Where the Holocron is built: tools, automation and the people who ship them.",
						channels: [
							{ channel: "rules", description: "How we treat each other", emoji: "📜" },
							{ channel: "dev", description: "Day-to-day building talk", emoji: "🛠️" },
							{ channel: "ideas", description: "Half-formed ideas and things to spec", emoji: "💡" },
							{ channel: "releases", description: "Each release, as it ships", emoji: "🚀" },
							{ channel: "deploys", description: "Deploys and preview checks", emoji: "📦" },
						],
					},
					// The questions a new member answers. Not switched on: Discord needs at least 7 default channels,
					// 5 of them open for members to post in, and the server has fewer discussion channels than that.
					onboarding: {
						defaultChannels: ["welcome", "rules", "dev", "ideas", "releases", "deploys"],
						prompts: [
							{
								title: "What brings you here?",
								options: [
									{
										title: "Building with Holocron",
										description: "Shows the dev and ideas channels",
										emoji: "🛠️",
										channels: ["dev", "ideas"],
									},
									{
										title: "Following releases",
										description: "Shows the releases and deploys channels",
										emoji: "🚀",
										channels: ["releases", "deploys"],
									},
								],
							},
						],
					},
					// The server itself. Community features need the rules and updates channels, a verification of
					// at least low, and the content filter on all members.
					server: {
						verification: "medium",
						defaultNotifications: "mentions",
						contentFilter: "all",
						systemChannel: "welcome",
						rulesChannel: "rules",
						updatesChannel: "community-updates",
						community: true,
						locale: "en-US",
					},
					roles: [
						{
							name: "gatekeepers",
							mentionable: true,
							color: "#f0b232",
							hoist: true,
							// Kept equal to the GitHub team of the same name by `holocron notifications sync-roles`.
							team: "gatekeepers",
							// Everything a member can do, and nothing more: the bot can only grant what it holds itself.
							permissions: [
								"ViewChannel",
								"SendMessages",
								"ReadMessageHistory",
								"AddReactions",
								"EmbedLinks",
								"AttachFiles",
								"UseExternalEmojis",
							],
							secret: "HOLOCRON_NOTIFY_ALERT_ROLE",
						},
					],
				},
			},
		],
		// Wiki: Fern publishes the engineering wiki at wiki.theholocron.dev/holocron
		wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron", icon: "fa-duotone fa-gear" }],
	},
	// Logs: ship local runs to the shared holocron-local Axiom dataset. Needs an
	// Axiom token in the keyring (`holocron auth set axiom.theholocron <TOKEN>`)
	// or HOLOCRON_AXIOM_TOKEN. CI overrides the dataset to holocron-ci via the
	// HOLOCRON_AXIOM_DATASET variable (env wins over config).
	log: { axiom: { dataset: "holocron-local" } },
	agent: "claude",
	skills: ["git-safety", "pr-workflow", "commit-standards", "security-review", "holocron-skill-plugin", "turborepo"],
} satisfies HolocronConfig);
