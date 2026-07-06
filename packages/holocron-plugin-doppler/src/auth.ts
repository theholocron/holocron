/**
 * Token resolution for the Doppler plugin.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_DOPPLER_TOKEN env var (preferred — explicit intent)
 *   3. DOPPLER_TOKEN env var (Doppler-native, works in CI)
 *   4. keyring (com.theholocron.cli / "doppler")
 *   5. AuthError with a hint pointing at `doppler configure`
 */

import { getToken as getKeyringToken } from "@theholocron/cli";

export class AuthError extends Error {
	override name = "AuthError";
}

export interface ResolveTokenInput {
	/** From `--token` CLI flag. */
	cliToken?: string;
	/** Env vars; passed in for testability. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
	/** Keyring lookup fn; passed in for testability. Defaults to `getToken(provider)`. */
	keyring?: (provider: string) => string | null;
}

export function resolveToken(input: ResolveTokenInput = {}): string {
	const env = input.env ?? process.env;
	const keyring = input.keyring ?? getKeyringToken;
	const token = input.cliToken || env.HOLOCRON_DOPPLER_TOKEN || env.DOPPLER_TOKEN || keyring("doppler");
	if (!token) {
		throw new AuthError(
			"no Doppler token found. Pass --token <TOKEN>, set HOLOCRON_DOPPLER_TOKEN / DOPPLER_TOKEN, " +
				"or run: holocron auth set doppler $(doppler configure get token --plain)"
		);
	}
	return token;
}
