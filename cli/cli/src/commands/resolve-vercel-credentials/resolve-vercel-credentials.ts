import { PREFIX } from "@theholocron/env-utils/lookup";
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
 * `HOLOCRON_VERCEL_TEAM_ID` (or the bare `VERCEL_TEAM_ID`) wins over the configured provider's `teamId`, so the override CI
 * passes keeps working. Each name is read as `HOLOCRON_<NAME>` first, then bare: `VERCEL_TOKEN` is the one the Vercel
 * plugin's own `HOLOCRON_VERCEL_TOKEN` / `VERCEL_TOKEN` pair already uses. A value that
 * is not set is left out, so the result spreads straight into the input of `resolveVercelBypassHeaders`.
 *
 * @param resolved - The loaded config, when the command has one. `check resolved` loads none.
 * @param env - The environment to read. Default `process.env`; a test passes its own.
 */
export function resolveVercelCredentials(
	resolved?: Pick<ResolvedHolocronConfig, "providers">,
	env?: Record<string, string | undefined>
): VercelCredentials {
	const vercelToken = resolveValue(["VERCEL_TOKEN"], env, { prefix: PREFIX });
	const vercelTeamId = resolveValue(["VERCEL_TEAM_ID"], env, { prefix: PREFIX }) ?? configuredTeamId(resolved);
	const bypassSecret = resolveValue(["VERCEL_PROTECTION_BYPASS_SECRET"], env, { prefix: PREFIX });
	return {
		...(vercelToken ? { vercelToken } : {}),
		...(vercelTeamId ? { vercelTeamId } : {}),
		...(bypassSecret ? { bypassSecret } : {}),
	};
}
