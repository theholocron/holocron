import type { Probe, ProbeRow } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import type { Permission, Rule } from "./expectations.js";
import { parseTokenArgs } from "./parse-token-args.js";
import type { TokenProbeContext } from "./token.type.js";

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
 * Reads one list and says what came back. Sentry answers a token without the scope with a 401 or 403, and an empty
 * list may only mean there are none, so an empty list is `none` too. Any other failure (the network, a 404, a 5xx) is an
 * `error`.
 */
async function reach(read: () => Promise<readonly { name?: string; slug?: string }[]>, noun: string): Promise<Outcome> {
	try {
		const items = await read();
		if (items.length === 0) {
			return { kind: "none", detail: `no ${noun} visible (none exist, or the token cannot see them)` };
		}
		const names = items.map((i) => i.slug ?? i.name).filter((n): n is string => typeof n === "string");
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
 * The `token` probe: reads what Holocron reads from Sentry (the organizations, the projects and the alert rules) with a
 * token and reports which of them it reaches. It only reads, so it changes nothing. The token is the one the plugin
 * resolves, so `--token sentry=<token>` or `--environment <layer>` checks another one; the organization is the
 * provider's `org` option. A write scope (`project:write`, `org:write`, `alerts:write`) has no read that proves it, so it
 * is not probed.
 *
 * A token with no layer is only described. When the CLI passes `--layer` (because `--environment` named `ci`, `dev` or
 * `local`), the results are judged against what that layer's token is meant to carry (the plugin's `tokens`
 * declaration, read with `tokenExpectations()` and narrowed to the token `--token-name` names, which the CLI passes for
 * each declared token the Environment holds) and shown in two groups, what it should have and what it should not, where
 * a missing or extra permission fails.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Try each Sentry read Holocron uses (organizations, projects, alert rules) with a token and report which it reaches; for a ci or dev Environment, check it against what that layer should carry. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const { layer, tokenName } = parseTokenArgs(probe.args ?? []);
			const token = ctx.token();
			probe.secret(token);
			const client = ctx.client();
			const rules = layer
				? tokenExpectations(tokens, { layer, ...(tokenName ? { envName: tokenName } : {}) })[0]?.rules
				: undefined;
			if (layer && !rules) {
				probe.say({
					status: "info",
					label: layer,
					detail: "no expectations are declared for it, so the token is only described",
				});
			}

			const tried: Tried[] = [
				{
					label: "Organizations: Read",
					permission: "org",
					outcome: await reach(() => client.auth.organizations(), "organizations"),
				},
			];
			const org = ctx.org;
			if (org) {
				tried.push({
					label: "Projects: Read",
					permission: "projects",
					outcome: await reach(() => client.projects.list(org), "projects"),
				});
				tried.push({
					label: "Alert rules: Read",
					permission: "alerts",
					outcome: await reach(() => client.workflows.list(org), "alert rules"),
				});
			} else {
				probe.say({
					status: rules ? "fail" : "info",
					label: "projects and alert rules",
					detail: "no org: set `org` in the sentry provider's options to check them",
				});
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
