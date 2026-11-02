/**
 * `holocron doctor dns` — do the DNS records the config makes setup write exist, pointing where they should?
 *
 * Read-only. One row per zone, each record looked up by type and name (case-insensitively) in what the `dns`
 * provider lists for the zone. A record that is missing, points elsewhere, or is not proxied where it must be is a
 * problem; a record in the zone that is not expected never is. With no `dns` provider and records expected, the
 * rows are skips with the reason; a provider with no token for the read skips its zone.
 *
 * A custom domain on the `deployment` provider (Sentinel's `sentinel.theholocron.dev` on Vercel) gets a row of its
 * own. `expectedDnsRecords()` leaves it out because `ensureCustomDomain()` creates the domain when asked, so the
 * target comes from the read-only `expectedDomainRecord()` instead, and the record must be there, point at that
 * target and not be proxied (a proxied record breaks the provider's certificate issuance). Nothing here writes.
 */

import { errorMessage } from "@theholocron/misc-utils";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Deployment,
	type Dns,
	type DnsRecord,
	PluginLoader,
	type Wiki,
} from "../../plugin/index.js";
import {
	type CheckRow,
	declaredVsActual,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "../doctor-checks/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import { previewConfigOf } from "../setup/preview-config-of.js";
import type { DoctorDnsReport, ExpectedDnsRecord, RunDoctorDnsInput } from "./doctor-dns.type.js";
import { expectedDnsRecords } from "./expected-dns-records.js";

type Wanted = ExpectedDnsRecord["record"];

/** The project and hostname `holocron repo setup` hands to `ensureCustomDomain()`, so the ones the doctor reads. */
function deploymentDomains(
	config: ResolvedHolocronConfig,
	deploy: Deployment
): { project: string; hostname: string }[] {
	const preview = previewConfigOf(config);
	const domains: { project: string; hostname: string }[] = [];
	if (!preview && deploy.domain) domains.push({ project: config.name, hostname: deploy.domain });
	if (preview?.domain) domains.push({ project: preview.project, hostname: preview.domain });
	return domains;
}

/** `CNAME *.example.com`: a record is its type and its name, however the provider spells the case or the final dot. */
const keyOf = (record: Pick<DnsRecord, "type" | "name" | "content">): string => {
	const key = `${record.type} ${record.name.toLowerCase().replace(/\.$/, "")}`;
	// A name can hold several MX or TXT records, so their value is part of what identifies one.
	return record.type === "MX" || record.type === "TXT" ? `${key} ${normalise(record.content)}` : key;
};

/** A value without its case, final dot or the quotes a provider wraps a TXT value in. */
const normalise = (value: string): string =>
	value
		.toLowerCase()
		.replace(/^"(.*)"$/, "$1")
		.replace(/\.$/, "");

const sameContent = (a: string, b: string): boolean => normalise(a) === normalise(b);

export async function runDoctorDns(input: RunDoctorDnsInput): Promise<DoctorDnsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor dns");

	const expected = expectedDnsRecords(input.loaded.resolved, {
		...(loader.has("deployment") ? { deployment: loader.get("deployment") as Deployment } : {}),
		...(loader.has("wiki") ? { wiki: loader.get("wiki") as Wiki } : {}),
		layouts: (loader.has("notifications") ? loader.get("notifications") : []).flatMap((p) =>
			p.layout ? [p.layout] : []
		),
	});
	const zones = [...new Set(expected.map((e) => e.zone))];
	const deploy = loader.has("deployment") ? (loader.get("deployment") as Deployment) : undefined;
	const domains = deploy?.expectedDomainRecord ? deploymentDomains(input.loaded.resolved, deploy) : [];

	const rows: CheckRow[] = [];
	if (zones.length === 0 && domains.length === 0) {
		rows.push({ id: "dns", title: "dns", status: "ok", detail: "none declared", problems: [] });
	} else if (!loader.has("dns")) {
		const why = whyMissing(loader, "dns", "no `dns` provider to check them with");
		for (const zone of zones) rows.push(row(zone, "skip", why));
		for (const { hostname } of domains) rows.push(domainRow(hostname, "skip", why));
	} else {
		const dns = loader.get("dns") as Dns;
		for (const zone of zones) {
			rows.push(
				await checkZone(
					dns,
					zone,
					expected.filter((e) => e.zone === zone).map((e) => e.record)
				)
			);
		}
		for (const { project, hostname } of domains) rows.push(await checkDomain(dns, deploy!, project, hostname));
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor dns");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

function row(zone: string, status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow {
	return { id: `dns-${zone}`, title: `${zone} records exist`, status, detail, problems };
}

function domainRow(hostname: string, status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow {
	return {
		id: `dns-domain-${hostname}`,
		title: `${hostname} points at the deployment, DNS-only`,
		status,
		detail,
		problems,
	};
}

/** A custom domain: the target the deployment provider recommends, read without writing, against the zone's record. */
async function checkDomain(dns: Dns, deploy: Deployment, project: string, hostname: string): Promise<CheckRow> {
	try {
		const request = await deploy.expectedDomainRecord!(project, hostname);
		if (!request) return domainRow(hostname, "skip", `${deploy.providerName} recommends no record for it`);
		return await checkZone(dns, request.zone, [request.record], domainRow.bind(undefined, hostname));
	} catch (err) {
		const noToken = missingTokenReason(err);
		return noToken !== undefined
			? domainRow(hostname, "skip", noToken)
			: domainRow(hostname, "fail", errorMessage(err));
	}
}

async function checkZone(
	dns: Dns,
	zone: string,
	wanted: Wanted[],
	rowOf: (status: CheckRow["status"], detail: string, problems?: string[]) => CheckRow = (...args) =>
		row(zone, ...args)
): Promise<CheckRow> {
	try {
		const have = await dns.listRecords(zone);
		const problems = declaredVsActual(
			new Map(wanted.map((w) => [keyOf(w), w])),
			new Map(have.map((h) => [keyOf(h), h])),
			{
				noun: "record",
				flagExtra: false,
				equal: (want, found) =>
					sameContent(want.content, found.content) &&
					(want.proxied === undefined || (found.proxied === true) === want.proxied),
				show: (r) => `${r.content}${r.proxied ? " (proxied)" : ""}`,
			}
		);
		return problems.length > 0
			? rowOf("fail", `${problems.length} problem(s)`, problems)
			: rowOf("ok", `${wanted.length} of ${wanted.length} exist`);
	} catch (err) {
		const noToken = missingTokenReason(err);
		return noToken !== undefined ? rowOf("skip", noToken) : rowOf("fail", errorMessage(err));
	}
}
