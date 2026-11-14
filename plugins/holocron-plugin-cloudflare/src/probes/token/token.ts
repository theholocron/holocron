import type { Probe, ProbeRow } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";
import type { CfZone } from "@theholocron/cloudflare-client";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import type { Permission, Rule } from "./expectations.js";
import { parseTokenArgs } from "./parse-token-args.js";
import type { TokenProbeContext } from "./token.type.js";

/** The most zones whose DNS and Workers routes are read, so a token that sees many does not make many requests. */
const MAX_ZONES = 5;

/** How many names to show before "(+N more)". */
const SHOWN = 5;

/** `a, b, c (+2 more)`. */
function summarise(names: readonly string[]): string {
	return names.length <= SHOWN
		? names.join(", ")
		: `${names.slice(0, SHOWN).join(", ")} (+${names.length - SHOWN} more)`;
}

/** What one read came back with: the token reaches some, reaches none (no access, or none exist), or the read broke. */
type Outcome = { kind: "has" | "none" | "error"; detail: string };

/** One permission tried: its row label, which permission it is, and what the read came back with. */
interface Tried {
	label: string;
	permission: Permission;
	outcome: Outcome;
}

/**
 * Reads one list and says what came back. Cloudflare answers a token without the permission in one of two ways (a 401 or
 * 403, or an empty list), so an empty list is `none`: the token cannot see any, or there are none. A request that fails
 * for another reason (the network, a 5xx) is an `error`.
 */
async function reach(read: () => Promise<readonly { name?: string }[]>, noun: string): Promise<Outcome> {
	try {
		const items = await read();
		if (items.length === 0) {
			return { kind: "none", detail: `no ${noun} visible (none exist, or the token cannot see them)` };
		}
		const names = items.map((i) => i.name).filter((n): n is string => typeof n === "string");
		return {
			kind: "has",
			detail: names.length > 0 ? `${items.length} ${noun}: ${summarise(names)}` : `${items.length} ${noun}`,
		};
	} catch (err) {
		if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) {
			return { kind: "none", detail: `no access (${err.status})` };
		}
		return { kind: "error", detail: errorMessage(err) };
	}
}

/**
 * One row for what was tried. With no rule it only describes (`ok` for access, `info` for none). Under a layer's rule it
 * judges: a required permission the token lacks fails, and one the layer must not have fails when the token has it; a
 * permission that is rightly absent is a bare `ok`.
 */
function rowFor({ label, outcome }: Tried, rule: Rule | undefined): ProbeRow {
	if (outcome.kind === "error") return { status: "fail", label, detail: outcome.detail };
	const has = outcome.kind === "has";
	if (rule === "required") {
		return has
			? { status: "ok", label, detail: outcome.detail }
			: { status: "fail", label, detail: outcome.detail };
	}
	if (rule === "absent") {
		return has ? { status: "fail", label, detail: outcome.detail } : { status: "ok", label };
	}
	return { status: has ? "ok" : "info", label, detail: outcome.detail };
}

/**
 * The `token` probe: tries each permission Holocron uses with the Cloudflare API token and reports which ones the token
 * has. It only reads (a list per permission), so it changes nothing. The token is the one the plugin resolves, so
 * `--token cloudflare=<token>` or `--environment <layer>` checks another one; the account id is the plugin's own.
 *
 * A token with no layer is only described. When the CLI passes `--layer` (because `--environment` named `ci`, `dev` or
 * `local`), the results are judged against what that layer's token is meant to carry (the plugin's `tokens` declaration, read with `tokenExpectations()`) and shown in
 * two groups, what it should have and what it should not, where a missing or extra permission fails. The other words
 * limit the zone checks to those zones; otherwise up to five are read. How the token is chosen is in `holocron probe --help`.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Try each Cloudflare permission Holocron uses (zones, DNS, Workers routes and scripts, Pages, tunnels) with a token and report which it has; for a ci or dev Environment, check it against what that layer should carry. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const token = ctx.token();
			probe.secret(token);
			const client = ctx.client();

			const { layer, zones: wanted } = parseTokenArgs(probe.args ?? []);
			const rules = layer ? tokenExpectations(tokens, { layer })[0]?.rules : undefined;
			if (layer && !rules) {
				probe.say({
					status: "info",
					label: layer,
					detail: "no expectations are declared for it, so the token is only described",
				});
			}

			// /user/tokens/verify answers only for a token with User: API Tokens Read; an account or zone token gets a 401
			// there even when it works, so only a token that passes is worth a row.
			try {
				const verified = await client.tokens.verify();
				probe.say({ status: "ok", label: "token", detail: `${verified.id} (${verified.status})` });
			} catch {
				// Judged by what it can reach, below.
			}

			const tried: Tried[] = [];
			let zones: CfZone[] = [];
			const zoneOutcome = await reach(async () => {
				zones =
					wanted.length > 0
						? (await Promise.all(wanted.map((name) => client.zones.list({ name })))).flat()
						: await client.zones.list({ per_page: MAX_ZONES });
				return zones.map((z) => ({ name: z.name }));
			}, "zones");
			tried.push({ label: "Zone: Read", permission: "zone", outcome: zoneOutcome });

			if (zoneOutcome.kind !== "error") {
				for (const zone of zones.slice(0, MAX_ZONES)) {
					tried.push({
						label: `DNS: Edit (${zone.name})`,
						permission: "dns",
						outcome: await reach(() => client.dns.list(zone.id), "records"),
					});
					tried.push({
						label: `Workers Routes: Edit (${zone.name})`,
						permission: "routes",
						outcome: await reach(
							async () => (await client.workers.listRoutes(zone.id)).map((r) => ({ name: r.pattern })),
							"routes"
						),
					});
				}
				const account = ctx.options.accountId;
				if (account) {
					tried.push({
						label: "Workers Scripts: Edit",
						permission: "scripts",
						outcome: await reach(
							async () => (await client.workers.listScripts(account)).map((s) => ({ name: s.id })),
							"scripts"
						),
					});
					tried.push({
						label: "Pages: Edit",
						permission: "pages",
						outcome: await reach(() => client.pages.listProjects(account), "projects"),
					});
					tried.push({
						label: "Cloudflare Tunnel: Edit",
						permission: "tunnels",
						outcome: await reach(() => client.tunnels.list(account), "tunnels"),
					});
				} else {
					probe.say({
						status: rules ? "fail" : "info",
						label: "account permissions",
						detail: "no account id: set HOLOCRON_CLOUDFLARE_ACCOUNT_ID or the plugin's accountId option to check them",
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
				const inGroup = tried.filter((t) => rules[t.permission] === rule);
				if (inGroup.length === 0) continue;
				probe.say({ status: "heading", label: heading });
				for (const t of inGroup) probe.say(rowFor(t, rule));
			}
		},
	};
}
