import type { Probe } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import { parseLayer } from "./parse-layer.js";
import type { TokenProbeContext } from "./token.type.js";

/**
 * The `token` probe for Vercel. It asks who the token belongs to (the plugin's `verifyToken`, `/v2/user`) and whether it can list projects, which
 * are reads and change nothing. Vercel does not report a token's scope, so the probe cannot judge permissions: it says
 * so, and with `--layer` (passed because `--environment` named a layer) it only says whether that layer is one that
 * should hold the token, from the plugin's `tokens` declaration. The token is never printed.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Check a Vercel token with the current user and the project list, and for a layer that it is one that should hold the token. Vercel cannot report a token's scope, so permissions are not checked. Read-only.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			const token = ctx.token();
			probe.secret(token);
			const client = ctx.client();

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

			const who = await ctx.verify(token);
			if (!who.ok) {
				probe.say({ status: "fail", label: "token", detail: who.message });
				return;
			}
			probe.say({ status: "ok", label: "token", detail: who.subject });

			try {
				const { projects } = await client.projects.list();
				probe.say({ status: "ok", label: "Projects: Read", detail: `${projects.length} projects` });
			} catch (err) {
				if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) {
					probe.say({ status: "info", label: "Projects: Read", detail: `no access (${err.status})` });
				} else {
					probe.say({ status: "fail", label: "Projects: Read", detail: errorMessage(err) });
				}
			}

			probe.say({
				status: "info",
				label: "permissions",
				detail: "Vercel cannot report a token's scope, so it is not checked",
			});
		},
	};
}
