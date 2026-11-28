import type { Probe } from "@theholocron/cli";
import { tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import { NO_TEAM } from "../../capabilities/cache.js";
import { parseLayer } from "./parse-layer.js";
import type { TokenProbeContext } from "./token.type.js";

/** The states Vercel documents for Remote Caching; anything else is described, not failed. */
const KNOWN_STATES = new Set(["enabled", "disabled", "over_limit", "paused"]);

/**
 * The `token` probe for Turbo. It asks Vercel's remote-cache status endpoint for the configured team
 * (`HOLOCRON_TURBO_TEAM`), which proves the token is accepted and the cache answers for that team: reads only. Vercel
 * does not report a token's scope (Full Account or a team), so the probe says it cannot judge permissions. With
 * `--layer` (passed because `--environment` named a layer) it also says whether that layer is one that should hold the
 * token, from the plugin's `tokens` declaration. A token with no team is a failure naming the variable. The token is
 * never printed.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Check a Turbo remote-cache token: that Vercel accepts it and that the remote cache answers for the configured team (HOLOCRON_TURBO_TEAM). Vercel cannot report a token's scope, so permissions are not checked. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			probe.secret(ctx.token());

			const layer = parseLayer(probe.args ?? []);
			if (layer) {
				const declared = tokenExpectations(tokens, { layer }).length > 0;
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

			const team = ctx.team();
			if (!team) {
				probe.say({ status: "fail", label: "team", detail: NO_TEAM });
				return;
			}
			probe.say({ status: "ok", label: "team", detail: team });

			let check;
			try {
				check = await ctx.cache().checkToken();
			} catch (err) {
				probe.say({ status: "fail", label: "remote cache", detail: errorMessage(err) });
				return;
			}

			if (check.problem === "token") {
				probe.say({ status: "fail", label: "token", detail: check.reason ?? "refused" });
				return;
			}
			probe.say({ status: "ok", label: "token", detail: "accepted by Vercel" });

			if (check.problem === "team") {
				probe.say({ status: "fail", label: "team access", detail: check.reason ?? "no access" });
				return;
			}
			probe.say({ status: "ok", label: "team access", detail: `the cache answers for ${team}` });

			if (check.status !== undefined && !KNOWN_STATES.has(check.status)) {
				probe.say({
					status: "info",
					label: "remote cache",
					detail: `Vercel reported a state this probe does not know: ${check.status}`,
				});
			} else if (check.ok) {
				probe.say({ status: "ok", label: "remote cache", detail: "enabled" });
			} else {
				probe.say({
					status: "fail",
					label: "remote cache",
					detail: check.reason ?? check.status ?? "not usable",
				});
			}

			if (check.readOnly) {
				probe.say({
					status: "info",
					label: "upload",
					detail: "the token can read the cache but not upload to it (Vercel reports it read-only)",
				});
			}

			probe.say({
				status: "info",
				label: "permissions",
				detail: "Vercel cannot report a token's scope (Full Account or a team), so it is not checked",
			});
		},
	};
}
