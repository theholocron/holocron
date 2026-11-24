import type { Probe } from "@theholocron/cli";
import { ProviderApiError, tokenExpectations } from "@theholocron/cli";

import { tokens } from "../../auth.js";
import { parseTokenArgs } from "./parse-token-args.js";
import type { TokenProbeContext } from "./token.type.js";

/** What a failed read says: a key the API refuses (401, 403) is named, anything else is the error's own message. */
function failure(err: unknown): string {
	if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) {
		return `refused (${err.status}): the key cannot read this`;
	}
	return err instanceof Error ? err.message : String(err);
}

/**
 * The `token` probe for Checkly. Checkly reports no role or scope for a key, so the probe proves only what a read
 * proves: it lists the account's status pages and the incidents of the first one (what `sync-incidents` reads). A
 * refusal or any error on either is a `fail`, because the `ci` key must read them. It cannot tell a Read Only key from
 * a Read & Write one without writing, so a row says so. With `--layer` it also says whether that layer is one that
 * should hold the key. Read-only; never prints the key.
 */
export function tokenProbe(ctx: TokenProbeContext): Probe {
	return {
		summary:
			"List the Checkly account's status pages and the first one's incidents with a key, and for a layer check that it is one that should hold the key. Checkly reports no role, so a read-only key cannot be told from a writing one. Read-only.",
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

			const client = ctx.client();
			let pageId: string | undefined;
			try {
				const pages = await client.statusPages.list();
				pageId = pages[0]?.id;
				probe.say({ status: "ok", label: "status pages", detail: `read ${pages.length}` });
			} catch (err) {
				probe.say({ status: "fail", label: "status pages", detail: failure(err) });
			}

			if (pageId !== undefined) {
				try {
					const incidents = await client.statusPages.incidents.list(pageId);
					probe.say({
						status: "ok",
						label: "incidents",
						detail: `read ${incidents.length} on the first status page`,
					});
				} catch (err) {
					probe.say({ status: "fail", label: "incidents", detail: failure(err) });
				}
			}

			probe.say({
				status: "info",
				label: "permissions",
				detail: "Checkly reports no role for a key, so a Read Only key cannot be told from a writing one; sync-incidents only reads, so a Read Only key is enough",
			});
		},
	};
}
