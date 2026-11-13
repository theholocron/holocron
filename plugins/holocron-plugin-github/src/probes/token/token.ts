import type { PermissionRule, Probe, ProbeRow } from "@theholocron/cli";
import { tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../tokens.js";
import { parseTokenArgs } from "./parse-token-args.js";
import { type Permission, PERMISSIONS } from "./permissions.js";
import type { TokenProbeContext } from "./token.type.js";

/** The token checked when none is named: the one the plugin reads with by default. */
const DEFAULT_TOKEN = "HOLOCRON_READ_TOKEN";

/** What one read came back with: the token reaches it, does not (no access, or nothing there), or the read broke. */
interface Outcome {
	kind: "has" | "none" | "error";
	detail: string;
}

/** One permission tried: its row label, which permission it is, and what the read came back with. */
interface Tried {
	label: string;
	permission: Permission;
	outcome: Outcome;
}

/** Does one GET with the token; the response headers are returned for the caller that wants them. */
async function get(ctx: TokenProbeContext, token: string, path: string): Promise<Response> {
	return ctx.fetch(`${ctx.baseUrl}${path}`, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
			"user-agent": "holocron-probe",
		},
	});
}

/**
 * One read for one permission. GitHub answers a token without the permission with a 403, or a 404 for something it will
 * not admit exists, so both are `none`; a 2xx is `has`. Any other status, or a request that did not go through, is an
 * `error`, which is a failure whatever the layer expects.
 */
async function reach(ctx: TokenProbeContext, token: string, permission: Permission): Promise<Outcome> {
	const [owner = ""] = ctx.repo.split("/");
	const path = PERMISSIONS[permission].path.replaceAll("{r}", ctx.repo).replaceAll("{o}", owner);
	try {
		const res = await get(ctx, token, path);
		if (res.ok) return { kind: "has", detail: `read ${path.split("?")[0]}` };
		if (res.status === 403 || res.status === 404) return { kind: "none", detail: `no access (${res.status})` };
		return { kind: "error", detail: `${res.status} ${res.statusText}`.trim() };
	} catch (err) {
		return { kind: "error", detail: errorMessage(err) };
	}
}

/**
 * One row for what was tried. With no rule it only describes (`ok` for access, `info` for none). Under a layer's rule it
 * judges: a required permission the token lacks fails, and one the layer must not have fails when the token has it; a
 * permission that is rightly absent is a bare `ok`.
 */
function rowFor({ label, outcome }: Tried, rule: PermissionRule | undefined): ProbeRow {
	if (outcome.kind === "error") return { status: "fail", label, detail: outcome.detail };
	const has = outcome.kind === "has";
	if (rule === "required") return { status: has ? "ok" : "fail", label, detail: outcome.detail };
	if (rule === "absent") return has ? { status: "fail", label, detail: outcome.detail } : { status: "ok", label };
	return { status: has ? "ok" : "info", label, detail: outcome.detail };
}

/**
 * The `token` probe: `holocron probe github token` tries each permission Holocron uses with one of the plugin's nine
 * tokens and reports which ones the token reaches. It only reads (one GET per permission), so it changes nothing, and a
 * read proves the token can see an area, not that it can write there.
 *
 * GitHub lists scopes only for a classic token (the `X-OAuth-Scopes` header on any response), so a classic token's scopes
 * are shown. A fine-grained token has no list, so the permissions are found by trying them; the first row says which kind
 * was read. With `--environment <layer>` the CLI runs the probe once for each token the Environment holds and hands it
 * `--token-name <envName>` (and the token itself as `cliToken`); by hand, `--token-name` picks which token the plugin
 * resolves (default `HOLOCRON_READ_TOKEN`).
 *
 * With no layer the token is only described. When the CLI passes `--layer` (because `--environment` named `ci`, `dev` or
 * `local`), the results are judged against what that token is meant to carry in that layer (the plugin's `tokens`
 * declaration, read with `tokenExpectations()`) and shown in two groups, what it should have and what it should not,
 * where a missing or extra permission fails.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Try each GitHub permission Holocron uses (contents, actions, issues, administration, secrets, ...) with one of the plugin's tokens and report which it reaches; for a ci or dev Environment, check it against what that layer should carry. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const { layer, tokenName } = parseTokenArgs(probe.args ?? []);
			const envName = tokenName ?? DEFAULT_TOKEN;
			const token = ctx.resolve(envName);
			if (token === undefined) {
				probe.say({
					status: "fail",
					label: envName,
					detail: `not a GitHub token; use one of: ${ctx.tokenNames.join(", ")}`,
				});
				return;
			}
			probe.secret(token);

			// `/user` answers for a token of either kind, and says which: only a classic token carries `X-OAuth-Scopes`.
			let identity: Response;
			try {
				identity = await get(ctx, token, "/user");
			} catch (err) {
				probe.say({ status: "fail", label: "token", detail: errorMessage(err) });
				return;
			}
			if (identity.status === 401) {
				probe.say({
					status: "fail",
					label: "token",
					detail: "rejected by GitHub (401): expired, revoked or not a token",
				});
				return;
			}
			const scopes = identity.headers.get("x-oauth-scopes");
			probe.say({
				status: "ok",
				label: "token",
				detail:
					scopes === null
						? "fine-grained (GitHub lists no permissions for one, so each is tried with a read)"
						: `classic (scopes: ${scopes === "" ? "none" : scopes}); each permission is also tried with a read`,
			});

			const declared = layer ? tokenExpectations(tokens, { layer, envName })[0] : undefined;
			if (layer && !declared) {
				probe.say({
					status: "info",
					label: layer,
					detail: "no expectations are declared for this token there, so it is only described",
				});
			}
			const rules = (declared?.rules ?? {}) as Partial<Record<Permission, PermissionRule>>;
			const names = declared ? (Object.keys(rules) as Permission[]) : (Object.keys(PERMISSIONS) as Permission[]);

			const tried: Tried[] = [];
			for (const permission of names) {
				tried.push({
					label: PERMISSIONS[permission].label,
					permission,
					outcome: await reach(ctx, token, permission),
				});
			}

			if (!declared) {
				for (const t of tried) probe.say(rowFor(t, undefined));
				return;
			}
			const groups: Array<[string, PermissionRule]> = [
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
