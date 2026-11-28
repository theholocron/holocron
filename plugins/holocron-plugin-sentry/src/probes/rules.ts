import type { Probe } from "@theholocron/cli";

import { requireOrg, type SentryProbeDeps } from "./probe-deps.type.js";

export function rulesProbe(deps: SentryProbeDeps): Probe {
	return {
		summary: "List the alert rules: enabled, projects attached, and what each action sends to.",
		writes: false,
		async run(probe) {
			const org = requireOrg(deps);
			const client = deps.client();
			const [workflows, apps] = await Promise.all([client.workflows.list(org), client.sentryApps.list(org)]);
			const alertable = new Set(apps.filter((a) => a.isAlertable).map((a) => a.slug));
			if (workflows.length === 0) probe.say({ status: "info", label: "no alert rules" });
			for (const wf of workflows) {
				const actions = wf.actionFilters.flatMap((f) => f.actions);
				const described = actions.map((a) => {
					const target = String(a.config["targetIdentifier"] ?? a.config["targetType"] ?? "");
					return target ? `${a.type} ${target}` : a.type;
				});
				// What setup writes is a `webhook` action naming an alertable integration; a `sentry_app` one shows as unknown.
				const problems = actions.flatMap((a) => {
					if (a.type === "sentry_app") return [`a sentry_app action shows as an unknown integration`];
					if (a.type === "webhook" && !alertable.has(String(a.config["targetIdentifier"]))) {
						return [`webhook ${String(a.config["targetIdentifier"])} is not an alertable integration`];
					}
					return [];
				});
				probe.say({
					status: problems.length > 0 || !wf.enabled ? "fail" : "ok",
					label: wf.name,
					detail: [
						wf.enabled ? "enabled" : "DISABLED",
						`detectors: ${wf.detectorIds.length}`,
						`actions: ${described.join(", ") || "none"}`,
						...problems,
					].join(" | "),
				});
			}
		},
	};
}
