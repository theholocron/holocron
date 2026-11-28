import type { Probe, ProbeRow } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import { botNeeds } from "../../bot-needs.js";
import { permissions } from "../../rest.js";
import { GUILD } from "./expectations.js";
import { parseTokenArgs } from "./parse-token-args.js";
import type { TokenProbeContext } from "./token.type.js";

/** The bot token's variable in the plugin's `tokens`, which is where the layers' expectations are read from and the only token this probe checks. */
const BOT_TOKEN = "HOLOCRON_DISCORD_BOT_TOKEN";

type Rule = "required" | "absent";

/** The rules the plugin's `tokens` declare for a layer's bot token, read through `tokenExpectations()`. */
const declared = (layer: string, envName: string) => tokenExpectations(tokens, { layer, envName })[0]?.rules;

/** What one check came back with: the bot has it, does not, or the read broke. */
interface Outcome {
	kind: "has" | "none" | "error";
	detail?: string;
}

/** One check made: the key a rule is declared under, its row label and what it came back with. */
interface Tried {
	key: string;
	label: string;
	outcome: Outcome;
}

/** `ManageChannels` as `Manage Channels`, the way the permission is named in Discord's own screens. */
const words = (name: string): string => name.replace(/([a-z])([A-Z])/g, "$1 $2");

/**
 * One row for what was tried. With no rule it only describes (`ok` for a held permission, `info` for one it lacks).
 * Under a layer's rule it judges: a required permission the bot lacks fails, and one the layer must not have fails when
 * the bot has it; a permission rightly absent is a bare `ok`.
 */
function rowFor({ label, outcome }: Tried, rule: Rule | undefined): ProbeRow {
	const detail = outcome.detail ? { detail: outcome.detail } : {};
	if (outcome.kind === "error") return { status: "fail", label, ...detail };
	const has = outcome.kind === "has";
	if (rule === "required") return { status: has ? "ok" : "fail", label, ...detail };
	if (rule === "absent") return has ? { status: "fail", label, ...detail } : { status: "ok", label };
	return { status: has ? "ok" : "info", label, ...detail };
}

/**
 * What the bot holds in the server: everything for the owner or an Administrator, else the permissions of its roles
 * (@everyone and the ones it has). Channel overwrites are not looked at; `doctor notifications` does that per forum.
 */
async function heldPermissions(ctx: TokenProbeContext, guildId: string, ownerId: string | undefined, me: string) {
	if (ownerId === me) return () => true;
	const bot = ctx.bot();
	const [member, roles] = await Promise.all([bot.guilds.member(guildId, me), bot.guilds.roles(guildId)]);
	const held = new Set([guildId, ...member.roles]);
	const bits = roles.filter((r) => held.has(r.id)).reduce((all, r) => all | BigInt(r.permissions ?? "0"), 0n);
	const has = (name: Parameters<typeof permissions>[0][number]): boolean => {
		const bit = BigInt(permissions([name]));
		return (bits & bit) === bit;
	};
	const admin = has("Administrator");
	return (name: string) => admin || has(name as Parameters<typeof has>[0]);
}

/**
 * The `token` probe: checks the Discord bot token against the configured server. It asks for the bot's application (is
 * the token good), whether the bot is a member of the `guildId` server, and which of the permissions Holocron needs
 * (`botNeeds()`, the same list `setup`'s invite link and `doctor notifications` use) its roles give it. It only reads,
 * so it changes nothing. The token is the one the plugin resolves, so `--token discord=<token>` or `--environment
 * <layer>` checks another one.
 *
 * A token with no layer is only described. When the CLI passes `--layer` (because `--environment` named a layer), the
 * results are judged against what that layer's token is meant to carry (the plugin's `tokens` declaration, read with
 * `tokenExpectations()`) and shown in two groups, what it should have and what it should not.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Check the Discord bot token: that it is valid, that the bot is in the configured server, and which of the permissions Holocron needs its roles give it; for a layer's Environment, check it against what that layer should carry. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const { layer, tokenName } = parseTokenArgs(probe.args ?? []);
			// `--environment` runs the probe once per declared token the Environment holds; the webhook and the client secret are not bot tokens.
			if (tokenName !== undefined && tokenName !== BOT_TOKEN) {
				probe.say({
					status: "info",
					label: tokenName,
					detail: "not a bot token, so this probe does not check it",
				});
				return;
			}
			const token = ctx.token();
			probe.secret(token);
			if (/^https?:\/\//i.test(token)) {
				probe.say({
					status: "fail",
					label: "token",
					detail: "that is a webhook URL, not a bot token (HOLOCRON_DISCORD_BOT_TOKEN)",
				});
				return;
			}
			const bot = ctx.bot();

			const rules = layer ? (ctx.rules ?? declared)(layer, BOT_TOKEN) : undefined;
			if (layer && !rules) {
				probe.say({
					status: "info",
					label: layer,
					detail: "no expectations are declared for it, so the token is only described",
				});
			}

			let me: string;
			try {
				const app = await bot.application.get();
				probe.say({ status: "ok", label: "token", detail: `bot: ${app.name} (id: ${app.id})` });
				me = (await bot.users.me()).id;
			} catch (err) {
				probe.say({ status: "fail", label: "token", detail: errorMessage(err) });
				return;
			}

			const guildId = ctx.options.guildId;
			if (!guildId) {
				probe.say({
					status: rules ? "fail" : "info",
					label: "server",
					detail: "no guildId in the discord provider options, so membership and permissions cannot be checked",
				});
				return;
			}

			const keys = [...new Set(botNeeds(ctx.options.layout))];
			const tried: Tried[] = [];
			let held: ((name: string) => boolean) | undefined;
			try {
				const guild = (await bot.guilds.get(guildId)) as { name?: string; owner_id?: string };
				held = await heldPermissions(ctx, guildId, guild.owner_id, me);
				tried.push({
					key: GUILD,
					label: "Server membership",
					outcome: { kind: "has", detail: guild.name ?? guildId },
				});
			} catch (err) {
				if (err instanceof ProviderApiError && (err.status === 403 || err.status === 404)) {
					// The bot is not in the server (or the id is wrong): nothing in it can be read, so the permissions are none.
					tried.push({
						key: GUILD,
						label: "Server membership",
						outcome: { kind: "none", detail: `the bot is not in server ${guildId} (${err.status})` },
					});
					held = () => false;
				} else {
					tried.push({
						key: GUILD,
						label: "Server membership",
						outcome: { kind: "error", detail: errorMessage(err) },
					});
				}
			}
			// With the server unreadable there is nothing to say about each permission, only the one failing row.
			if (held) {
				for (const key of keys) {
					const has = held(key);
					tried.push({
						key,
						label: words(key),
						outcome: has ? { kind: "has" } : { kind: "none", detail: "not held" },
					});
				}
			}

			if (!rules) {
				for (const t of tried) probe.say(rowFor(t, undefined));
				return;
			}
			const groups: Array<[string, Rule]> = [
				["Should have", "required"],
				["Should not have", "absent"],
			];
			for (const [heading, rule] of groups) {
				// A permission only the layout asks for (Pin Messages, ...) is not declared, but the layer's token must have it too.
				const inGroup = tried.filter((t) => (rules[t.key] ?? "required") === rule);
				if (inGroup.length === 0) continue;
				probe.say({ status: "heading", label: heading });
				for (const t of inGroup) probe.say(rowFor(t, rule));
			}
		},
	};
}
