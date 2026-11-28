import type { ConvertedApp } from "./convert-app-manifest.type.js";

/**
 * Exchanges the one-time code from the manifest flow for the App's id, private key and webhook secret
 * (`POST /app-manifests/{code}/conversions`, which takes no token). The code works once, and GitHub shows the key
 * once. An error names the status, never the body: the body of a success is the secrets.
 */
export async function convertAppManifest(code: string, fetchImpl: typeof fetch = fetch): Promise<ConvertedApp> {
	const response = await fetchImpl(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
		method: "POST",
		headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
	});
	if (!response.ok) throw new Error(`GitHub did not convert the manifest (HTTP ${response.status})`);
	const body = (await response.json()) as Record<string, unknown>;
	const { id, slug, html_url: htmlUrl, pem, webhook_secret: webhookSecret } = body;
	if (
		typeof id !== "number" ||
		typeof slug !== "string" ||
		typeof htmlUrl !== "string" ||
		typeof pem !== "string" ||
		typeof webhookSecret !== "string"
	) {
		throw new Error("GitHub's answer did not hold the App id, private key and webhook secret");
	}
	return { id, slug, htmlUrl, pem, webhookSecret };
}
