import type { ChecklyClient } from "../rest.js";

export interface ChecklyProbeDeps {
	client: () => ChecklyClient;
	env?: Record<string, string | undefined>;
	/** Waits between status reads. Defaults to a real timer. */
	sleep?: (ms: number) => Promise<void>;
	/** Milliseconds between status reads. Defaults to 15 s. */
	pollMs?: number;
	/** Longest to wait for one change of status. Defaults to 12 minutes (the check runs every 5). */
	timeoutMs?: number;
}

/** The alert channel the probes use: `HOLOCRON_CHECKLY_PROBE_CHANNEL`, else the one `notifications setup` makes for #uptime. */
export const DEFAULT_CHANNEL = "Message to #uptime";
export const channelName = (deps: ChecklyProbeDeps): string =>
	(deps.env ?? process.env)["HOLOCRON_CHECKLY_PROBE_CHANNEL"] ?? DEFAULT_CHANNEL;
