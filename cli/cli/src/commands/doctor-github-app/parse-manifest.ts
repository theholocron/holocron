import type { AppPermissionLevel, GitHubAppManifest } from "./doctor-github-app.type.js";

const LEVELS: readonly string[] = ["read", "write", "admin"];

/** Reads the permissions and events out of an App manifest's text; throws an `Error` saying what is wrong with it. */
export function parseManifest(text: string): GitHubAppManifest {
	const raw = JSON.parse(text) as { default_permissions?: unknown; default_events?: unknown };
	const permissions = raw.default_permissions;
	if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
		throw new Error("`default_permissions` must be an object of permission name to read, write or admin");
	}
	for (const [name, level] of Object.entries(permissions)) {
		if (typeof level !== "string" || !LEVELS.includes(level)) {
			throw new Error(
				`\`default_permissions.${name}\` must be read, write or admin, got ${JSON.stringify(level)}`
			);
		}
	}
	const events = raw.default_events ?? [];
	if (!Array.isArray(events) || !events.every((e) => typeof e === "string")) {
		throw new Error("`default_events` must be a list of event names");
	}
	return { permissions: permissions as Record<string, AppPermissionLevel>, events: events as string[] };
}
