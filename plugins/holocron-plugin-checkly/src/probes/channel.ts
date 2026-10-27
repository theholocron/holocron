import type { Probe } from "@theholocron/cli";

import { DISCORD_TEMPLATE } from "../rest.js";
import { sameTemplate } from "../same-template.js";
import { findChannel } from "./find-channel.js";
import type { ChecklyProbeDeps } from "./probe-deps.type.js";

const PAGE = 100;

async function allCheckIds(client: ReturnType<ChecklyProbeDeps["client"]>): Promise<string[]> {
	const ids: string[] = [];
	for (let page = 1; ; page++) {
		const batch = await client.checks.list({ limit: PAGE, page });
		ids.push(...batch.map((c) => c.id));
		if (batch.length < PAGE) return ids;
	}
}

export function channelProbe(deps: ChecklyProbeDeps): Probe {
	return {
		summary:
			"Show the Discord alert channel: where it posts, whether its template is the shipped one, how many checks use it.",
		writes: false,
		async run(probe) {
			const client = deps.client();
			const channel = await findChannel(client, deps);
			// The webhook URL is a credential: only its host is shown.
			probe.secret(channel.config.url);
			let host = "an unreadable URL";
			try {
				host = new URL(channel.config.url).host;
			} catch {
				// keep the placeholder
			}
			probe.say({
				status: "ok",
				label: `${channel.config.name} (${channel.id})`,
				detail: [
					`posts to ${host}`,
					`format: ${channel.config.webhookType ?? "unset"}`,
					`sends: ${[channel.sendFailure && "failure", channel.sendRecovery && "recovery", channel.sendDegraded && "degraded"].filter(Boolean).join(", ") || "nothing"}`,
				].join(" | "),
			});
			probe.say(
				sameTemplate(channel.config.template, DISCORD_TEMPLATE)
					? { status: "ok", label: "template is the shipped one" }
					: {
							status: "fail",
							label: "template differs from the shipped one",
							detail: "run `holocron notifications setup` to put it back",
						}
			);
			const [ids] = await Promise.all([allCheckIds(client)]);
			const subscribed = new Set(
				channel.subscriptions.filter((s) => s.checkId && s.activated !== false).map((s) => s.checkId)
			);
			const missing = ids.filter((id) => !subscribed.has(id)).length;
			probe.say(
				missing === 0
					? { status: "ok", label: `all ${ids.length} checks use it` }
					: {
							status: "fail",
							label: `${ids.length - missing} of ${ids.length} checks use it`,
							detail: "run `holocron notifications setup` to subscribe the rest",
						}
			);
		},
	};
}
