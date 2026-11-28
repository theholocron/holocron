import type { Errors, NotificationsLayout } from "../../plugin/index.js";

export interface SentryRelayChecksInput {
	layout: NotificationsLayout;
	/** The configured `errors` provider, or undefined when there is none. */
	errors: Pick<Errors, "providerName" | "inspectRelay"> | undefined;
	/** Why there is no `errors` provider: the reason the steps skip. */
	errorsMissingReason: string;
}
