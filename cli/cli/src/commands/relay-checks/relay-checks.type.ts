import type { Errors, NotificationsLayout, ServerInspection, Workers } from "../../plugin/index.js";

export interface RelayChecksInput {
	layout: NotificationsLayout;
	/** The configured `errors` provider, or undefined when there is none. It names the relay's source and webhook. */
	errors: Pick<Errors, "providerName"> | undefined;
	/** Why there is no `errors` provider: the reason the steps skip. */
	errorsMissingReason: string;
	/** The configured `workers` provider, or undefined when there is none. */
	workers: Pick<Workers, "providerName" | "inspectScript"> | undefined;
	/** Why there is no `workers` provider: the reason the Worker steps skip. */
	workersMissingReason: string;
	/** The server as `inspect` read it, or undefined when it could not be read. */
	found: ServerInspection | undefined;
	/** Test seam for the request to the Worker. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
}
