import type { GitHubAppCredentials } from "@theholocron/github-client";
import { errorMessage } from "@theholocron/misc-utils";

import { type GitHubAppConfig, resolvedEnvironment } from "../../config/index.js";
import type { PluginLoader } from "../../plugin/index.js";

/** The names the App's credentials are kept under, Sentinel's own first and the bare ones an older Environment has (#1864). */
const APP_ID = ["SENTINEL_GITHUB_APP_ID", "GITHUB_APP_ID"] as const;
const PRIVATE_KEY = ["SENTINEL_GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_PRIVATE_KEY"] as const;

/** The first of `names` the environment holds a value for. */
function held(values: Record<string, string>, names: readonly string[]): string | undefined {
	return names.map((name) => values[name]).find((value) => value?.trim());
}

/** An error's message with the secrets it was handed taken out, so nothing read from the vault is ever printed. */
export function scrubbed(err: unknown, secrets: string[]): string {
	return secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join("[redacted]"), errorMessage(err));
}

/**
 * The App's id and key from its vault environment, read in memory and never printed or written, or the reason they cannot
 * be had (no `vault` provider, an environment that cannot be read, a name it does not hold). Shared by `doctor github-app`
 * and `redeliver webhooks`, which both call the App's own endpoints with its JWT.
 */
export async function readAppCredentials(
	instance: GitHubAppConfig,
	loader: PluginLoader
): Promise<{ creds: GitHubAppCredentials } | { reason: string }> {
	const vault = loader.has("vault") ? loader.get("vault") : undefined;
	if (!vault?.readEnvironment) {
		return {
			reason: vault
				? `${vault.providerName} cannot read an environment's variables`
				: "needs a `vault` provider in holocron.config.ts (1password)",
		};
	}
	const environment = resolvedEnvironment(instance);
	let values: Record<string, string>;
	try {
		values = await vault.readEnvironment(environment);
	} catch (err) {
		return { reason: `cannot read the "${environment}" environment: ${errorMessage(err)}` };
	}
	const appId = held(values, APP_ID);
	const key = held(values, PRIVATE_KEY);
	const missing = [appId ? undefined : APP_ID, key ? undefined : PRIVATE_KEY].filter((names) => names !== undefined);
	if (missing.length > 0) {
		const named = missing.map(([preferred, older]) => `${preferred} (or ${older})`).join(" or ");
		return { reason: `"${environment}" does not hold ${named}` };
	}
	// A key kept on one line in a vault carries its line breaks as a literal `\n`.
	const privateKey = (key as string).includes("\n") ? (key as string) : (key as string).replace(/\\n/g, "\n");
	return { creds: { appId: (appId as string).trim(), privateKey } };
}
