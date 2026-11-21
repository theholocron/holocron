import type { Probe } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { tokens } from "../../auth.js";
import { parseLayer } from "./parse-layer.js";
import type { TokenProbeContext } from "./token.type.js";

/**
 * The `token` probe for Vercel. It asks who the token belongs to (the plugin's `verifyToken`, `/v2/user`) and whether it can list projects, which
 * are reads and change nothing, and the team's webhook list, the read next to making a relay webhook. Vercel does not
 * report a token's scope, so the probe cannot judge permissions beyond that: it says so, and with `--layer` (passed
 * because `--environment` named a layer) it says whether that layer is one that should hold the token and, for a layer
 * that requires `webhooks`, fails when the list is refused. The token is never printed.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Check a Vercel token with the current user, the project list and the team's webhook list, and for a layer that it is one that should hold the token (a laptop layer must see the webhooks). Vercel cannot report a token's scope, so making a webhook is not tried. Read-only.",
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

			// `webhooks`: the one permission declared. A read proves the token sees the team's webhooks; making one cannot be
			// tried without writing, so a layer that requires it is judged on the read.
			const needsWebhooks = layer
				? tokenExpectations(tokens, { layer }).some((entry) => entry.required.includes("webhooks"))
				: false;
			try {
				const hooks = await client.webhooks.list();
				probe.say({ status: "ok", label: "Webhooks: Read", detail: `${hooks.length} webhooks` });
			} catch (err) {
				const noAccess = err instanceof ProviderApiError && (err.status === 401 || err.status === 403);
				probe.say({
					status: noAccess && !needsWebhooks ? "info" : "fail",
					label: "Webhooks: Read",
					detail: noAccess ? `no access (${err.status})` : errorMessage(err),
				});
			}

			probe.say({
				status: "info",
				label: "permissions",
				detail: "Vercel cannot report a token's scope: reading the team's webhooks is proven, making one is not (it would write)",
			});
		},
	};
}
