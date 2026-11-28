import { type EnvLookup, holocronEnv } from "@theholocron/env-utils/lookup";

/**
 * Load service account credentials from environment variables.
 * Each variable is read as `HOLOCRON_<NAME>` first, then the bare `<NAME>`.
 * Set GOOGLE_SERVICE_ACCOUNT_JSON to the full JSON key file content,
 * or set individual GOOGLE_* variables for each field.
 *
 * @param env - Where to read the variables from; defaults to the process environment, pass a fake in tests.
 */
export function loadServiceAccountKey(env: EnvLookup = holocronEnv()): Record<string, string> {
	const raw = env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
	if (raw) {
		return JSON.parse(raw) as Record<string, string>;
	}

	const required = [
		"GOOGLE_TYPE",
		"GOOGLE_PROJECT_ID",
		"GOOGLE_PRIVATE_KEY_ID",
		"GOOGLE_PRIVATE_KEY",
		"GOOGLE_CLIENT_EMAIL",
		"GOOGLE_CLIENT_ID",
	];

	for (const key of required) {
		if (!env.get(key)) {
			throw new Error(`Missing required environment variable: ${key}`);
		}
	}

	return {
		type: env.get("GOOGLE_TYPE")!,
		project_id: env.get("GOOGLE_PROJECT_ID")!,
		private_key_id: env.get("GOOGLE_PRIVATE_KEY_ID")!,
		private_key: env.get("GOOGLE_PRIVATE_KEY")!.replace(/\\n/g, "\n"),
		client_email: env.get("GOOGLE_CLIENT_EMAIL")!,
		client_id: env.get("GOOGLE_CLIENT_ID")!,
		auth_uri: "https://accounts.google.com/o/oauth2/auth",
		token_uri: "https://oauth2.googleapis.com/token",
		auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
		client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(env.get("GOOGLE_CLIENT_EMAIL")!)}`,
		universe_domain: "googleapis.com",
	};
}
