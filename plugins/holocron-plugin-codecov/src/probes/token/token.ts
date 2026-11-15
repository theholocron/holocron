import type { Probe } from "@theholocron/cli";
import { tokenExpectations } from "@theholocron/cli";

import { tokens } from "../../auth.js";
import { parseTokenArgs } from "./parse-token-args.js";
import type { TokenProbeContext } from "./token.type.js";

/**
 * The `token` probe for Codecov. Codecov has no permission model, so the probe cannot judge permissions; it checks what
 * can be proved. It reads the repository once from Codecov's REST API with the token (`coverage.checkToken()`):
 *
 * - **accepted** (200): Codecov answered for the repository with this token. For a public repository that proves little,
 *   because the API answers without a token, and the row says so.
 * - **refused** (401, 403): `info`, never `fail`. The repository upload token (`measure:bundle`'s) is not a credential
 *   the REST API takes, and a revoked API token answers the same, so Codecov cannot tell this probe which it is.
 * - **not found** (404): `info`. No such repository on Codecov, or the token cannot see it.
 * - anything else (the network, a 5xx): `fail`, because that says nothing about access.
 *
 * With `--layer` (the CLI passes it when `--environment` named a layer) it also says whether that layer is one that
 * should hold the token, against the plugin's `tokens` declaration. It never prints the token.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Ask Codecov's REST API for the repository with a token, and for a layer check that it is one that should hold the token. Codecov reports no permissions, and an upload token cannot be checked this way. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			probe.secret(ctx.token());
			probe.say({ status: "ok", label: "token", detail: "set" });

			const { layer, tokenName } = parseTokenArgs(probe.args ?? []);
			if (layer) {
				const declared =
					tokenExpectations(tokens, { layer, ...(tokenName ? { envName: tokenName } : {}) }).length > 0;
				probe.say(
					declared
						? { status: "ok", label: layer, detail: "a layer that should hold this token" }
						: {
								status: "info",
								label: layer,
								detail: "not a layer this token is declared for, so it is only described",
							}
				);
			}

			if (!ctx.repo) {
				probe.say({
					status: "info",
					label: "repository",
					detail: "none to ask Codecov about: set the plugin options owner and repo",
				});
			} else {
				try {
					const found = await ctx.coverage().checkToken();
					if (found.outcome === "accepted") {
						probe.say({
							status: "ok",
							label: "Codecov API",
							detail: `answered for ${ctx.repo} with this token`,
						});
						if (found.repoPrivate === false) {
							probe.say({
								status: "info",
								label: "public repository",
								detail: "Codecov answers a public repository without a token, so this does not prove the token",
							});
						}
					} else if (found.outcome === "refused") {
						probe.say({
							status: "info",
							label: "Codecov API",
							detail: `answered ${found.status} for ${ctx.repo}. A repository upload token is not one the REST API takes, so this cannot be checked for it; a revoked or wrong API token answers the same`,
						});
					} else {
						probe.say({
							status: "info",
							label: "repository",
							detail: `Codecov has no ${ctx.repo}, or the token cannot see it (404)`,
						});
					}
				} catch (err) {
					probe.say({
						status: "fail",
						label: "Codecov API",
						detail: err instanceof Error ? err.message : String(err),
					});
				}
			}

			probe.say({
				status: "info",
				label: "permissions",
				detail: "Codecov has no permission model and reports none, so they are not checked",
			});
		},
	};
}
