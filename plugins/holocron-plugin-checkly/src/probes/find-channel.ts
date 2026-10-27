import type { ChecklyClient } from "../rest.js";
import { channelName, type ChecklyProbeDeps } from "./probe-deps.type.js";

type Webhook = Extract<Awaited<ReturnType<ChecklyClient["alertChannels"]["list"]>>[number], { type: "WEBHOOK" }>;

/** The Discord webhook alert channel the probes work with, or an error that says how to name another. */
export async function findChannel(client: ChecklyClient, deps: ChecklyProbeDeps): Promise<Webhook> {
	const name = channelName(deps);
	const channel = (await client.alertChannels.list()).find(
		(c): c is Webhook => c.type === "WEBHOOK" && c.config.name === name
	);
	if (!channel) {
		throw new Error(
			`no alert channel named "${name}" (run \`holocron notifications setup\`, or set HOLOCRON_CHECKLY_PROBE_CHANNEL)`
		);
	}
	return channel;
}
