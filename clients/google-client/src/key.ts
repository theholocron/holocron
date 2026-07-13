/**
 * Load service account credentials from environment variables.
 * Set GOOGLE_SERVICE_ACCOUNT_JSON to the full JSON key file content,
 * or set individual GOOGLE_* variables for each field.
 */
export function loadServiceAccountKey(): Record<string, string> {
	const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
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
		if (!process.env[key]) {
			throw new Error(`Missing required environment variable: ${key}`);
		}
	}

	return {
		type: process.env.GOOGLE_TYPE!,
		project_id: process.env.GOOGLE_PROJECT_ID!,
		private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID!,
		private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
		client_email: process.env.GOOGLE_CLIENT_EMAIL!,
		client_id: process.env.GOOGLE_CLIENT_ID!,
		auth_uri: "https://accounts.google.com/o/oauth2/auth",
		token_uri: "https://oauth2.googleapis.com/token",
		auth_provider_x509_cert_url:
			"https://www.googleapis.com/oauth2/v1/certs",
		client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL!)}`,
		universe_domain: "googleapis.com",
	};
}
