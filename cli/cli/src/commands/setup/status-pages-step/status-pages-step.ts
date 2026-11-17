import { describeError } from "@theholocron/kyber/ui";

import type { DnsRecord, Monitoring, MonitoringStatusPageResult, PluginLoader } from "../../../plugin/index.js";
import { runStep, type SetupStepResult } from "../run-step/index.js";

/** The records Checkly asks for a status page's custom domain, as DNS records. */
function recordsToMake(domain: NonNullable<MonitoringStatusPageResult["domain"]>): DnsRecord[] {
	return [...(domain.record ? [domain.record] : []), ...(domain.extraRecords ?? [])].map((r) => ({
		type: r.type,
		name: r.name,
		content: r.value,
		// Checkly's verification names no proxy setting, and it reads the record itself to verify it, so it is made
		// DNS-only: a proxy would answer in its place.
		proxied: false,
	}));
}

/**
 * `holocron setup`'s step for the status pages `monitoring` declares (spec `tech-monitoring-dashboards-status-pages`):
 * ensure each page, then make the DNS records its custom domain needs through the `dns` provider. With no `dns`
 * provider a record still to make is a failing `todo` row that says what to make, never a silent skip. `--dry-run`
 * writes nothing, not even DNS. Never deletes.
 */
export async function statusPagesStep(
	monitoring: Monitoring,
	loader: PluginLoader,
	dryRun: boolean
): Promise<SetupStepResult[]> {
	const steps: SetupStepResult[] = [];
	for (const page of monitoring.statusPages ?? []) {
		if (!monitoring.ensureStatusPage) {
			steps.push({
				capability: "monitoring",
				step: `ensureStatusPage ${page.name}`,
				status: "skip",
				message: "provider does not implement ensureStatusPage",
			});
			continue;
		}
		let result: MonitoringStatusPageResult | undefined;
		steps.push(
			await runStep("monitoring", `ensureStatusPage ${page.name}`, dryRun, async () => {
				result = await monitoring.ensureStatusPage!(page);
				const made = result.components.created.length + result.rules.created.length;
				const changed =
					result.components.updated.length + result.rules.updated.length + (result.updated?.length ?? 0);
				return `${result.created ? "created" : "exists"}; ${made} made, ${changed} brought in line`;
			})
		);
		if (page.domain === undefined) continue;

		if (dryRun) {
			steps.push({
				capability: "monitoring",
				step: `dns ${page.domain}`,
				status: "dry-run",
				message: "would make the record the provider asks for",
			});
			continue;
		}
		const domain = result?.domain;
		if (!domain) continue; // the page step failed, and said so
		if (domain.verified) {
			steps.push({
				capability: "monitoring",
				step: `dns ${domain.name}`,
				status: "ok",
				message: "domain verified",
			});
			continue;
		}
		const records = recordsToMake(domain);
		if (records.length === 0) {
			steps.push({
				capability: "monitoring",
				step: `dns ${domain.name}`,
				status: "fail",
				message: "todo: the provider has not said which record to make yet; run setup again",
			});
			continue;
		}
		if (!loader.has("dns")) {
			for (const r of records) {
				steps.push({
					capability: "monitoring",
					step: `dns ${r.name}`,
					status: "fail",
					message: `todo: no \`dns\` provider is configured; make ${r.type} ${r.name} -> ${r.content}`,
				});
			}
			continue;
		}
		const dns = loader.get("dns");
		for (const r of records) {
			try {
				await dns.upsertRecord(r.name, r);
				steps.push({
					capability: "monitoring",
					step: `dns ${r.name}`,
					status: "ok",
					message: `${r.type} (DNS only) made; run \`holocron doctor monitoring\` once it has propagated`,
				});
			} catch (err) {
				steps.push({
					capability: "monitoring",
					step: `dns ${r.name}`,
					status: "fail",
					message: describeError(err),
				});
			}
		}
	}
	return steps;
}
