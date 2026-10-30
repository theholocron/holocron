import type { HolocronConfig } from "@theholocron/cli";
import { defineConfig } from "@theholocron/cli";
import { docsPreset } from "@theholocron/cli/presets";

// docsPreset() provides: org, domain, docs, strict repo protection, the base
// providers (source, ci, issues, deployment, dns, workers). Per D13
// (epic #672 / docs/wiki/specifications/tech-holocron-platform.spec.md): the preset's `tasks`
// and task-derived `extraRequiredChecks` still speak the pre-decomposition
// vocabulary (`lint`, `test`, `typecheck`, `deploy`, plain `"audit /
// Conclusion"`) — the `configs/` folder hasn't caught up to #675 yet, and
// doesn't need to for this repo to move (D13: it's a convenience preset,
// not a required dependency). This repo declares its own intent-facing
// tasks directly instead of spreading `presetTasks`/`presetChecks`.
const { repo, providers, org, domain, docs } = docsPreset();

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
		// Organization Actions variables the reusable workflows read as `vars.NAME`. `holocron repo setup` creates and
		// updates these; anything else already set in the org is reported and left alone (no `prune`). Values are plain
		// text, so identifiers only, never a secret. Still to add once their values are settled:
		// CLOUDFLARE_PAGES_PROJECT, HOLOCRON_AXIOM_DATASET, POSTHOG_PROJECT_TOKEN.
		variables: {
			org: {
				AXIOM_DATASET: "holocron-ci",
				CLOUDFLARE_ACCOUNT_ID: "9c558af98664d13fc89b7e0a0d93d5a8",
				TURBO_TEAM: "iamnewton",
			},
		},
	},
	// Required status checks not backed by a `{ required: true }` task.
	// `holocron repo setup` appends these to the task-derived contexts from
	// `astromech.requiredChecks()`. Only the aggregate codecov gates belong
	// here: a ruleset takes no wildcards and a package a PR does not touch posts
	// no status, so a per-package `codecov/patch/<slug>` can neither be listed
	// for every package (one per workspace, hundreds once the org's repos are
	// folded in) nor be relied on to appear. Codecov still posts the
	// per-component statuses; they are informational, not required (#1223).
	// "Dependency catalogs / Check" is the hand-maintained
	// `.github/workflows/sourceQuality.dependencyCatalogs.yml` (`holocron probe deps check`, #1380).
	extraRequiredChecks: ["codecov/patch", "codecov/project", "Dependency catalogs / Check"],
	// The decomposed intent vocabulary (epic #672, D3/#675) — what used to be
	// `docsPreset()`'s bundled `lint` (8 linters) is now 5 separately-gated
	// tasks; `typecheck`/`test`/`deploy` are renamed 1:1. `security`/`review`/
	// `stale`/`greetings`/`dependencies`/`bookkeeping` aren't part of the
	// task-name vocabulary (workflow-only keys, unaffected by the rename).
	// The repo-specific tasks (the decomposed audit tasks, platform.
	// repoValidation, delivery.publish, platform.repoSync, knowledge.wiki)
	// and `syncScripts: false` live in `astromech.config.ts` and are merged
	// in by astromech's `loadTasksConfig`.
	tasks: [
		{
			name: "sourceQuality.staticAnalysis",
			required: true,
			// Packages with no eslint.config of their own lint with the root one, which loads the workspace's
			// eslint-config from dist: build it first, even for a package that does not list it as a dependency.
			turbo: { dependsOn: ["@theholocron/eslint-config#delivery.build"] },
		},
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
		// Monitoring: Checkly. Only the alert channel is managed from here (the uptime channel's feed below); the checks
		// themselves are declared next to the service they watch, in apps/sentinel/holocron.config.ts.
		monitoring: ["checkly", { accountId: "fb82859a-4f62-4773-8404-db0f29f9262c" }],
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
					// Build apps/comlink first (`pnpm --filter @theholocron/comlink run delivery.build`); setup deploys it here.
					relay: { host: "comlink.theholocron.dev", errors: { projects: ["holocron-cli"] } },
					// Every webhook wears the Holocron mark. PNG, because that is what Discord accepts.
					webhookAvatar: "media/webhook-avatar.png",
					// Where a full `holocron doctor notifications` run leaves its one visible test post.
					testChannel: "holonet",
					// Keep ordinary members from pinging the whole server, and from adding emoji, stickers, sounds or
					// events (the permissions Discord's "disable risky permissions for @everyone" prompt flags).
					everyone: { deny: ["MentionEveryone", "CreateGuildExpressions", "CreateEvents"] },
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
								// Sentry's alerts arrive through the Comlink relay (the `relay` below), which posts through a webhook of
								// its own ("Sentry") whose URL goes straight to the Worker.
								{
									name: "errors",
									topic: "Errors from Sentinel and Sentry",
									webhook: true,
									feeds: { errors: true },
								},
								// Checkly posts here through a webhook of its own ("Checkly"), whose URL goes straight to Checkly. It
								// adopts the alert channel named "Message to #uptime" and subscribes every check on the account.
								{
									name: "uptime",
									topic: "Monitoring up/down",
									webhook: true,
									// The Checkly plugin carries its own icon (its CDN first, then an embedded copy) for that webhook in
									// Discord's Integrations list, so no picture is named here.
									feeds: { monitoring: true },
								},
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
								// The test channel: the doctor's own test post is left here, never in a real channel.
								{
									name: "holonet",
									topic: "Test posts from Holonet; safe to ignore or delete",
									webhook: true,
								},
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
					// Pinned at the top of #welcome and #rules. The layout is the whole set of messages the bot has pinned in a channel, so
					// editing this text replaces the pinned message on the next `holocron notifications setup`.
					pinned: [
						{
							channel: "welcome",
							content: [
								"**Welcome to The Holocron** 🌌",
								"",
								"This is where the Holocron is built: tools, automation and the people who ship them. It is all open source at <https://github.com/theholocron>.",
								"",
								"**Where to start**",
								"📜 #rules: how we treat each other. Read this first.",
								"🛠️ #dev: day-to-day building talk",
								"💡 #ideas: half-formed ideas and things to spec later",
								"🚀 #releases and 📦 #deploys: what shipped, as it ships",
								"",
								"**Getting help**",
								"Ask in #dev. For a bug or a feature request, open an issue at <https://github.com/theholocron/holocron/issues> so it does not get lost. The docs are at <https://docs.theholocron.dev/holocron/>.",
								"",
								"**About the bot**",
								"Holonet posts releases, deploys and repo syncs from GitHub Actions into the channels above. It does not read or store your messages: <https://docs.theholocron.dev/holocron/legal/privacy/>",
								"",
								"The maintainers hold the gatekeepers role.",
							].join("\n"),
						},
						{
							channel: "rules",
							content: [
								"**Rules** 📜",
								"",
								"The Holocron is a small, friendly place to build things. These keep it that way.",
								"",
								"**1. Be kind.** Disagree with the idea, not the person. No harassment, hate, slurs or personal attacks, and assume good intent until shown otherwise.",
								"**2. Stay on topic.** Building talk goes in #dev, half-formed ideas in #ideas. Keep the bot channels (#releases, #deploys, #alerts) for the bot.",
								"**3. No spam or self-promotion.** Share something you made if it is relevant to what we are doing, not as an ad. No unsolicited DMs.",
								"**4. Keep private things private.** Never post tokens, passwords or other people's personal information. If you leak a secret by accident, say so and rotate it.",
								"**5. Follow Discord's rules.** The [Terms of Service](<https://discord.com/terms>) and [Community Guidelines](<https://discord.com/guidelines>) apply here too.",
								"",
								"**Problems**",
								"If something is wrong, or someone is making you uncomfortable, message anyone with the gatekeepers role. They will keep your report private and see that it is dealt with.",
								"",
								"Rules may change as the community grows; changes are announced here.",
							].join("\n"),
						},
					],
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
