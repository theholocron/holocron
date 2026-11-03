import type { AppManifest, BuildAppManifestInput } from "./build-app-manifest.type.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The manifest to post to GitHub: the shared part read from a file, with this instance's name, webhook and redirect.
 * Throws a message that names the problem when the file or the webhook URL is not usable, so nothing reaches GitHub.
 */
export function buildAppManifest(input: BuildAppManifestInput): AppManifest {
	const { base } = input;
	if (!isRecord(base)) throw new Error("the manifest file must hold a JSON object");
	const permissions = base["default_permissions"];
	if (!isRecord(permissions) || !Object.values(permissions).every((access) => typeof access === "string")) {
		throw new Error("the manifest file needs a default_permissions object of permission name to access");
	}
	const events = base["default_events"];
	if (!Array.isArray(events) || !events.every((event) => typeof event === "string")) {
		throw new Error("the manifest file needs a default_events list of event names");
	}
	let webhook: URL;
	try {
		webhook = new URL(input.webhookUrl);
	} catch {
		throw new Error(`the webhook URL is not a URL: ${input.webhookUrl}`);
	}
	if (webhook.protocol !== "https:") throw new Error("the webhook URL must be https: GitHub only delivers to one");
	return {
		name: input.name,
		...(typeof base["description"] === "string" ? { description: base["description"] } : {}),
		...(typeof base["url"] === "string" ? { url: base["url"] } : {}),
		public: base["public"] === true,
		redirect_url: input.redirectUrl,
		hook_attributes: { url: webhook.href, active: true },
		default_permissions: permissions as Record<string, string>,
		default_events: events as string[],
	};
}
