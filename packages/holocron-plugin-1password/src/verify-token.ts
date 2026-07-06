/**
 * `verifyToken` — plugin-level export used by `holocron auth check`.
 *
 * 1Password doesn't use a bearer token like the REST-transport plugins
 * do — the `op` CLI manages its own auth via desktop-app biometric on
 * laptops and `OP_SERVICE_ACCOUNT_TOKEN` env var in CI. So the token
 * argument is intentionally IGNORED here. What we actually check is:
 * is `op` installed AND signed in (i.e., can it answer `whoami`).
 *
 * If someone tries `holocron auth set 1password <token>`, the token
 * will be stored in the keyring but never read by this plugin — the
 * `AUTH_HINT` below explains that up front.
 */

import { spawnSync } from "node:child_process";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

export interface VerifyTokenOptions {
	spawn?: typeof spawnSync;
	binary?: string;
}

interface WhoamiResponse {
	user_uuid?: string;
	account_uuid?: string;
	url?: string;
	email?: string;
}

export async function verifyToken(_token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const spawnImpl = opts.spawn ?? spawnSync;
	const binary = opts.binary ?? "op";
	const result = spawnImpl(binary, ["whoami", "--format=json"], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error) {
		return {
			ok: false,
			message: `1Password CLI (\`${binary}\`) not found on PATH. Install via \`brew install 1password-cli\`.`,
		};
	}
	if (result.status !== 0) {
		const detail = (result.stderr ?? "").trim() || `exit ${result.status ?? "?"}`;
		return { ok: false, message: `\`${binary} whoami\` failed: ${detail}` };
	}
	try {
		const parsed = JSON.parse(result.stdout ?? "{}") as WhoamiResponse;
		const subject = parsed.email ?? parsed.url ?? parsed.user_uuid ?? "signed in";
		return { ok: true, subject: `op: ${subject}` };
	} catch {
		return { ok: true, subject: "op: signed in" };
	}
}
