import type { Probe } from "@theholocron/cli";
import { tokenExpectations } from "@theholocron/cli";

import { tokens } from "../../auth.js";
import { parseLayer } from "./parse-layer.js";
import type { TokenProbeContext } from "./token.type.js";

/**
 * The `token` probe for Fern. Fern has no endpoint that reports who a token is or what it may do, so the probe cannot
 * judge permissions: it checks that a token is set, says whether the layer holds it when `--layer` is passed (because
 * `--environment` named one) against the plugin's `tokens` declaration, and states plainly that permissions are not
 * checked. It makes no request and never prints the token.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"Check that a Fern token is set, and for a layer that it is one that should hold it. Fern cannot report a token's permissions, so those are not checked. Read-only, no request.",
		writes: false,
		acceptsToken: true,
		async run(probe) {
			probe.secret(ctx.token());
			probe.say({ status: "ok", label: "token", detail: "set" });

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

			probe.say({
				status: "info",
				label: "permissions",
				detail: "Fern cannot report a token's permissions, so they are not checked",
			});
		},
	};
}
