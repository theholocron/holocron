import type { NotificationsLayout, Source } from "../../plugin/index.js";

export interface NotificationsWorkflowChecksInput {
	layout: NotificationsLayout;
	/** The configured `source` provider, or undefined when there is none. It reads the workflow file. */
	source: Pick<Source, "providerName" | "readFile"> | undefined;
	/** Why there is no `source` provider that can read a file: the reason the steps skip. */
	sourceMissingReason: string;
}
