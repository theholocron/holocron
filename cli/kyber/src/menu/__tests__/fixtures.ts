import type { OptionPrompt } from "../../prompts/index.js";
import type { MenuEntry } from "../menu-entry/index.js";

const TAG_OPTION: OptionPrompt = { key: "tag", flag: "--tag", type: "input", message: "dist-tag:" };

const OTP_OPTION: OptionPrompt = {
	key: "otp",
	flag: "--otp",
	type: "password",
	secret: true,
	askLast: true,
	message: "One-time password (2FA):",
};

/** A small CLI surface that exercises every shape a menu has to handle: leaves, groups, runnable groups, modes. */
export const ENTRIES: MenuEntry[] = [
	{ name: "doctor", description: "Check the setup", positionals: [], supportsDryRun: true },
	{
		name: "doctor all",
		description: "Check everything",
		positionals: [],
		supportsDryRun: true,
		menuLabel: "doctor (everything)",
	},
	{ name: "doctor dns", description: "Check DNS", positionals: [], supportsDryRun: true },
	{ name: "probe", description: "Poke a provider", positionals: [], opensMenu: true },
	{
		name: "deploy",
		description: "Deploy a branch",
		positionals: [{ key: "branch", message: "Branch:", type: "input" }],
		supportsDryRun: true,
	},
	{ name: "deploy on-release", description: "Deploy on release", positionals: [] },
	{
		name: "auth set",
		description: "Store a token",
		positionals: [{ key: "provider", message: "Provider:", type: "input" }],
	},
	{ name: "config show", description: "Show the config", positionals: [] },
	{ name: "repo setup", description: "Set the repo up", positionals: [] },
	{ name: "repo sync", description: "Sync the repo", positionals: [] },
	{ name: "repo sync readme", description: "Sync the readme", positionals: [] },
	{ name: "repo upgrade node", description: "Upgrade node", positionals: [] },
	{ name: "repo upgrade deps", description: "Upgrade dependencies", positionals: [] },
	{
		name: "run ci",
		description: "Run the CI tasks",
		positionals: [],
		spawnArgs: ["run", "ci.all"],
	},
	{
		name: "package publish",
		description: "Publish packages",
		positionals: [],
		supportsDryRun: true,
		modes: [
			{
				key: "steady",
				message: "Publish a new version",
				options: [
					TAG_OPTION,
					OTP_OPTION,
					{
						key: "provenance",
						flag: "--provenance",
						type: "confirm",
						default: true,
						negatable: true,
						message: "Publish with --provenance?",
					},
					{
						key: "skipAlreadyPublished",
						flag: "--skip-already-published",
						type: "confirm",
						default: false,
						message: "Skip a package already published?",
					},
				],
			},
			{
				key: "initial",
				message: "Initial publish (--initial)",
				flag: "--initial",
				options: [TAG_OPTION, OTP_OPTION],
			},
			{
				key: "syncTrust",
				message: "Sync trust (--sync-trust)",
				options: [
					{
						key: "syncTrust",
						flag: "--sync-trust",
						type: "input",
						arity: 2,
						required: true,
						message: "Workflow filename",
					},
					{ key: "repo", flag: "--repo", type: "input", message: "owner/repo:" },
				],
			},
		],
	},
];

/** Looks an entry up by name, failing loudly when a test names one the fixtures lack. */
export function entry(name: string): MenuEntry {
	const found = ENTRIES.find((e) => e.name === name);
	if (!found) throw new Error(`no fixture entry named "${name}"`);
	return found;
}
