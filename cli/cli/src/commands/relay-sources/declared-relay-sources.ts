import type { NotificationsLayout } from "../../plugin/index.js";
import type { DeclaredRelaySource } from "./relay-sources.type.js";

/** The sources `relay.sources` declares, in the order written. */
export function declaredRelaySources(layout: NotificationsLayout): DeclaredRelaySource[] {
	return Object.entries(layout.relay?.sources ?? {}).map(([id, spec]) => ({ id, spec }));
}
