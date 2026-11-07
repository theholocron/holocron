import { resolveValue } from "@theholocron/kyber/secrets";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { VercelCredentials } from "./resolve-vercel-credentials.type.js";

/** The `teamId` of the first configured `vercel` provider (the loader fills it from `.holocron/org.ts`), if any. */
function configuredTeamId(resolved: Pick<ResolvedHolocronConfig, "providers"> | undefined): string | undefined {
	for (const entry of Object.values(resolved?.providers ?? {})) {
		const tuples = entry.cardinality === "single" ? [entry.tuple] : entry.tuples;
		for (const tuple of tuples) {
			const teamId = tuple.provider === "vercel" ? tuple.options["teamId"] : undefined;
			if (typeof teamId === "string" && teamId !== "") return teamId;
		}
	}
	return undefined;
}

/**
 * Reads the Vercel token, team id and Deployment Protection bypass secret through the credential chain
 * (`resolveValue`: the environment, then the `credentials` providers) instead of `process.env`. The environment's
 * `VERCEL_TEAM_ID` wins over the configured provider's `teamId`, so the override CI passes keeps working. A value that
 * is not set is left out, so the result spreads straight into the input of `resolveVercelBypassHeaders`.
 *
 * @param resolved - The loaded config, when the command has one. `monitoring run-resolved` loads none.
 * @param env - The environment to read. Default `process.env`; a test passes its own.
 */
export function resolveVercelCredentials(
	resolved?: Pick<ResolvedHolocronConfig, "providers">,
	env?: Record<string, string | undefined>
): VercelCredentials {
	const vercelToken = resolveValue(["VERCEL_TOKEN"], env);
	const vercelTeamId = resolveValue(["VERCEL_TEAM_ID"], env) ?? configuredTeamId(resolved);
	const bypassSecret = resolveValue(["VERCEL_PROTECTION_BYPASS_SECRET"], env);
	return {
		...(vercelToken ? { vercelToken } : {}),
		...(vercelTeamId ? { vercelTeamId } : {}),
		...(bypassSecret ? { bypassSecret } : {}),
	};
}
