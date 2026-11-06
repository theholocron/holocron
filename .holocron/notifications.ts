import type { NotificationsLayout } from "@theholocron/cli";

// The Holocron Discord server layout: `holocron notifications setup` applies it and Sentinel's role sync reads it.
// `holocron.config.ts` keeps the provider entry (`guildId`); the loader puts this default export on its `layout`.
// The import is type-only on purpose: Sentinel evaluates this file from the default branch, so it pulls in no runtime code.
export default {
	// Build apps/comlink first (`pnpm --filter @theholocron/comlink run build`); setup deploys it here.
	// `projects` lists every Sentry project whose issues reach #errors; add a slug, then run `notifications setup`.
	relay: { host: "comlink.theholocron.dev", errors: { projects: ["holocron-cli", "holocron"] } },
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
				{ name: "welcome", topic: "What this server is and how to get help", webhook: true },
				{ name: "rules", topic: "How we treat each other here", webhook: true },
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
				// A forum: one post for each ADR and spec, made from the file by `holocron specs sync`
				// (tech-specs-discussion-threads, #1535), titled with the document's own title. A post's tag is the file's status; only the
				// bot and members who can manage threads (gatekeepers) can change a tag, and the sync turns a change into a
				// pull request. Half-formed ideas belong here too, as posts of their own.
				{
					name: "ideas",
					kind: "forum",
					topic: "One post for each ADR and spec, tagged with its status. Gatekeepers change a tag to change the status. Half-formed ideas and things to spec later start here too.",
					tags: [
						{ name: "draft", emoji: "✏️", moderated: true },
						{ name: "proposed", emoji: "💬", moderated: true },
						{ name: "accepted", emoji: "✅", moderated: true },
						{ name: "rejected", emoji: "❌", moderated: true },
						{ name: "deprecated", emoji: "🗑️", moderated: true },
						{ name: "archived", emoji: "📦", moderated: true },
						{ name: "superseded", emoji: "♻️", moderated: true },
						// Set by the spec-on-pull-request workflow when a pull request closes unmerged (#1653); never a file status.
						{ name: "withdrawn", emoji: "🔕", moderated: true },
					],
				},
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
	// editing this text (or the file a message names) replaces the pinned message on the next `holocron notifications setup`.
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
		// The rules live in RULES.md at the repo root; `notifications setup` pins whatever it says.
		{ channel: "rules", file: "RULES.md" },
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
			// Manage Threads is what lets a gatekeeper change the status tag of a spec's post in #ideas.
			permissions: [
				"ViewChannel",
				"SendMessages",
				"ReadMessageHistory",
				"AddReactions",
				"EmbedLinks",
				"AttachFiles",
				"UseExternalEmojis",
				"ManageThreads",
			],
			secret: "HOLOCRON_NOTIFY_ALERT_ROLE",
		},
	],
} satisfies NotificationsLayout;
