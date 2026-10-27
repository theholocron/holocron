import type { Dns, NotificationsLayout, Workers } from "../../plugin/index.js";

export interface DeployRelayInput {
	relay: NonNullable<NotificationsLayout["relay"]>;
	/** The error tracker whose alerts it carries; names the binding. */
	source: string;
	/** The channel's relay webhook URL. A credential: it goes to the Worker and nowhere else. */
	webhook: string;
	/** The tracker's signing secret for its requests, when setup could read it. A credential, like the webhook URL. */
	signingSecret?: string;
	repoRoot: string;
	workers: Workers;
	dns: Dns;
	/** Reads the built Worker. Defaults to the file system; tests pass their own. */
	readCode?: (path: string) => Promise<string>;
}
