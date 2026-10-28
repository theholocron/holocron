import { env } from "../../env/index.js";
import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";
import { type OptionPrompt } from "../../ui/index.js";

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

export const publishEntry: CommandEntry = {
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
};
