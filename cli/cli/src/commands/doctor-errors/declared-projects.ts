import type { NotificationsLayout } from "../../plugin/index.js";

/**
 * The error tracker projects the config declares: every project a notifications layout's `relay.errors.projects`
 * sends alerts from, in order, each once.
 */
export function declaredProjects(layouts: NotificationsLayout[]): string[] {
	return [...new Set(layouts.flatMap((layout) => layout.relay?.errors?.projects ?? []))];
}
