import type { Probe } from "@theholocron/cli";

import { requireOrg, type SentryProbeDeps } from "./probe-deps.type.js";

/** Where a webhook points, without a query string that could carry a token. */
function where(url: string | null): string {
	if (!url) return "no webhook";
	try {
		const u = new URL(url);
		return `${u.host}${u.pathname}`;
	} catch {
		return "an unreadable URL";
	}
}

export function integrationsProbe(deps: SentryProbeDeps): Probe {
	return {
		summary:
			"List the custom integrations: scopes, alert action, webhook, and whether the client secret is visible.",
		writes: false,
		async run(probe) {
			const apps = await deps.client().sentryApps.list(requireOrg(deps));
			if (apps.length === 0) probe.say({ status: "info", label: "no custom integrations" });
			for (const app of apps) {
				// The secret is shown to a token that holds every scope the integration has; never print it.
				probe.secret(app.clientSecret);
				probe.say({
					status: "ok",
					label: `${app.name} (${app.slug})`,
					detail: [
						`scopes: ${app.scopes.join(", ") || "none"}`,
						`alert action: ${app.isAlertable ? "on" : "off"}`,
						`webhook: ${where(app.webhookUrl)}`,
						`secret visible: ${app.clientSecret ? "yes" : "no"}`,
					].join(" | "),
				});
			}
		},
	};
}
