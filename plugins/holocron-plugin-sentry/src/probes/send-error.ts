import { randomUUID } from "node:crypto";

import type { Probe } from "@theholocron/cli";

import { requireOrg, type SentryProbeDeps } from "./probe-deps.type.js";

/** Which DSN to send to: `SENTRY_DSN`, else the first client key of the project named in `HOLOCRON_SENTRY_PROBE_PROJECT`. */
async function dsnFor(deps: SentryProbeDeps): Promise<string> {
	const env = deps.env ?? process.env;
	if (env["SENTRY_DSN"]) return env["SENTRY_DSN"];
	const project = env["HOLOCRON_SENTRY_PROBE_PROJECT"];
	if (!project) {
		throw new Error(
			"set SENTRY_DSN, or HOLOCRON_SENTRY_PROBE_PROJECT to a project slug, to say where to send the error"
		);
	}
	const keys = await deps.client().projects.keys(requireOrg(deps), project);
	const dsn = keys[0]?.dsn.public;
	if (!dsn) throw new Error(`project \`${project}\` has no client key`);
	return dsn;
}

export function sendErrorProbe(deps: SentryProbeDeps): Probe {
	return {
		summary: "Send one labelled test error to a project, to follow it through the alert rule to Discord.",
		writes: true,
		async run(probe) {
			const dsn = new URL(await dsnFor(deps));
			probe.secret(dsn.username);
			const projectId = dsn.pathname.replace(/^\/+/, "");
			const eventId = randomUUID().replaceAll("-", "");
			const message = `Holocron probe: sent on purpose (${new Date().toISOString()})`;
			const envelope = [
				JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
				JSON.stringify({ type: "event" }),
				JSON.stringify({
					event_id: eventId,
					level: "error",
					platform: "node",
					environment: "holocron-probe",
					message: { formatted: message },
					exception: { values: [{ type: "HolocronProbeError", value: message }] },
					tags: { probe: "sentry.send-error" },
				}),
			].join("\n");
			const sent = await probe.write("send a test error", async () => {
				const res = await (deps.fetch ?? fetch)(
					`${dsn.protocol}//${dsn.host}/api/${projectId}/envelope/?sentry_version=7&sentry_key=${dsn.username}&sentry_client=holocron-probe/1`,
					{ method: "POST", headers: { "content-type": "application/x-sentry-envelope" }, body: envelope }
				);
				if (!res.ok) throw new Error(`Sentry answered ${res.status}`);
				return true;
			});
			if (sent) {
				probe.say({
					status: "ok",
					label: "sent HolocronProbeError",
					detail: "look for it in the project's issues and, through the rule, in #errors; resolve the issue by hand (a probe cannot delete it)",
				});
			}
		},
	};
}
