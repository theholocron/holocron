import type { Probe, ProbeRow } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import { type Permission, RETIRED_DATASETS, type Rule } from "./expectations.js";
import { parseTokenArgs } from "./parse-token-args.js";
import type { TokenProbeContext } from "./token.type.js";

/** How many names to show before "(+N more)". */
const SHOWN = 8;

/** The time a query looks back over: a minute is enough, the query reads nothing the probe prints. */
const QUERY_WINDOW_MS = 60_000;

/** `a, b, c (+2 more)`. */
function summarise(names: readonly string[]): string {
	return names.length <= SHOWN
		? names.join(", ")
		: `${names.slice(0, SHOWN).join(", ")} (+${names.length - SHOWN} more)`;
}

/** What one request came back with: the token may do it, may not (or the dataset is not there), or the request broke. */
type Outcome = { kind: "has" | "none" | "error"; detail?: string };

/** One permission tried on one dataset: its row label, which permission it is, and what came back. */
interface Tried {
	label: string;
	permission: Permission;
	outcome: Outcome;
}

/**
 * Runs one request and says what came back. Axiom answers a token without the permission with a 401 or 403, and a
 * dataset the token cannot see (or that does not exist) with a 404; all three are `none`. A request that fails for
 * another reason (the network, a 5xx) is an `error`.
 */
async function reach(request: () => Promise<unknown>): Promise<Outcome> {
	try {
		await request();
		return { kind: "has" };
	} catch (err) {
		if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) {
			return { kind: "none", detail: `no access (${err.status})` };
		}
		if (err instanceof ProviderApiError && err.status === 404) {
			return { kind: "none", detail: "no such dataset, or the token cannot see it (404)" };
		}
		return { kind: "error", detail: errorMessage(err) };
	}
}

/** The APL query that reads one row of a dataset; the name is quoted the way APL quotes an identifier. */
function queryFor(dataset: string): string {
	return `['${dataset.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'] | take 1`;
}

/**
 * One row for what was tried. With no rule it only describes (`ok` for access, `info` for none). Under a layer's rule it
 * judges: a required permission the token lacks fails, and one the layer must not have fails when the token has it; a
 * permission that is rightly absent is a bare `ok`.
 */
function rowFor({ label, outcome }: Tried, rule: Rule | undefined): ProbeRow {
	const detail = outcome.detail === undefined ? {} : { detail: outcome.detail };
	if (outcome.kind === "error") return { status: "fail", label, ...detail };
	const has = outcome.kind === "has";
	if (rule === "required") return { status: has ? "ok" : "fail", label, ...detail };
	if (rule === "absent") return has ? { status: "fail", label, ...detail } : { status: "ok", label };
	return { status: has ? "ok" : "info", label, ...detail };
}

/**
 * The `token` probe: tries each permission Holocron uses with the Axiom token on a dataset (reading it, ingesting and
 * querying) and reports which ones the token has, then lists the datasets the token can see, so a token that reaches a
 * retired dataset (`holocron-local`) is visible. Ingesting sends an empty list, which writes no event, and the query
 * reads one row it never prints, so the probe changes nothing. The token is the one the plugin resolves, so
 * `--token axiom=<token>` or `--environment <layer>` checks another one; the dataset is the plugin's own, or the names
 * after the probe name.
 *
 * A token with no layer is only described. When the CLI passes `--layer` (because `--environment` named `ci`, `dev` or
 * `local`), the results are judged against what that layer's token is meant to carry (the plugin's `tokens` declaration,
 * read with `tokenExpectations()`) and shown in two groups, what it should have and what it should not, where a
 * missing or extra permission fails.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Try each Axiom permission Holocron uses (read, ingest, query) on a dataset with a token, and list the datasets the token can see; for a ci or dev Environment, check it against what that layer should carry. Read-only: ingest sends no event.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const token = ctx.token();
			probe.secret(token);
			const client = ctx.client();

			const { layer, datasets: named } = parseTokenArgs(probe.args ?? []);
			const rules = layer ? tokenExpectations(tokens, { layer })[0]?.rules : undefined;
			if (layer && !rules) {
				probe.say({
					status: "info",
					label: layer,
					detail: "no expectations are declared for it, so the token is only described",
				});
			}

			const targets = named.length > 0 ? named : ctx.options.dataset ? [ctx.options.dataset] : [];
			if (targets.length === 0) {
				probe.say({
					status: rules ? "fail" : "info",
					label: "dataset",
					detail: "none given: name one after the probe, or set HOLOCRON_AXIOM_DATASET or the plugin's dataset option",
				});
			}

			const tried: Tried[] = [];
			for (const dataset of targets) {
				const now = Date.now();
				tried.push(
					{
						label: `Read (${dataset})`,
						permission: "read",
						outcome: await reach(() => client.datasets.get(dataset)),
					},
					{
						label: `Ingest (${dataset})`,
						permission: "ingest",
						outcome: await reach(() => client.datasets.ingest(dataset, [])),
					},
					{
						label: `Query (${dataset})`,
						permission: "query",
						outcome: await reach(() =>
							client.datasets.query({
								apl: queryFor(dataset),
								startTime: new Date(now - QUERY_WINDOW_MS).toISOString(),
								endTime: new Date(now).toISOString(),
							})
						),
					}
				);
			}

			if (!rules) {
				for (const t of tried) probe.say(rowFor(t, undefined));
			} else {
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
			}

			probe.say({ status: "heading", label: "Datasets this token can see" });
			try {
				const names = (await client.datasets.list()).map((d) => d.name);
				probe.say(
					names.length === 0
						? { status: "info", label: "datasets", detail: "none visible" }
						: { status: "info", label: "datasets", detail: `${names.length}: ${summarise(names)}` }
				);
				for (const name of names.filter((n) => RETIRED_DATASETS.includes(n))) {
					probe.say({
						status: "info",
						label: name,
						detail: "retired (one dataset per service now, ADR-0019): the token still reaches it",
					});
				}
			} catch (err) {
				const denied = err instanceof ProviderApiError && (err.status === 401 || err.status === 403);
				probe.say({
					status: denied ? "info" : "fail",
					label: "datasets",
					detail: denied ? `the token cannot list datasets (${err.status})` : errorMessage(err),
				});
			}
		},
	};
}
