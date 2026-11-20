import type { Dns, NotificationsLayout, Workers } from "../../plugin/index.js";

/** What the Worker is given for one source: its channel's webhook URL and, when known, the vendor's signing secret. */
export interface RelayBinding {
	/** The source's id; names the bindings `COMLINK_<ID>_WEBHOOK` and `COMLINK_<ID>_SECRET`. */
	source: string;
	/** The channel's relay webhook URL. A credential: it goes to the Worker and nowhere else. */
	webhook: string;
	/** The vendor's signing secret for its requests, when setup could get it. A credential, like the webhook URL. */
	signingSecret?: string;
}

export interface DeployRelayInput {
	relay: NonNullable<NotificationsLayout["relay"]>;
	/** The sources the Worker is given secrets for: the error tracker's and each of `relay.sources`. */
	sources: RelayBinding[];
	repoRoot: string;
	workers: Workers;
	dns: Dns;
	/** Reads the built Worker. Defaults to the file system; tests pass their own. */
	readCode?: (path: string) => Promise<string>;
}
