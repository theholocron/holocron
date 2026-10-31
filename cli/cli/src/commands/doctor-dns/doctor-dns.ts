/**
 * `holocron doctor dns` — do the DNS records the config makes setup write exist, pointing where they should?
 *
 * Read-only. One row per zone, each record looked up by type and name (case-insensitively) in what the `dns`
 * provider lists for the zone. A record that is missing, points elsewhere, or is not proxied where it must be is a
 * problem; a record in the zone that is not expected never is. With no `dns` provider and records expected, the
 * rows are skips with the reason; a provider with no token for the read skips its zone.
 */

import { errorMessage } from "@theholocron/misc-utils";

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
import type { DoctorDnsReport, ExpectedDnsRecord, RunDoctorDnsInput } from "./doctor-dns.type.js";
import { expectedDnsRecords } from "./expected-dns-records.js";

type Wanted = ExpectedDnsRecord["record"];

/** `CNAME *.example.com`: a record is its type and its name, however the provider spells the case or the final dot. */
const keyOf = (record: Pick<DnsRecord, "type" | "name">): string =>
	`${record.type} ${record.name.toLowerCase().replace(/\.$/, "")}`;

const sameContent = (a: string, b: string): boolean =>
	a.toLowerCase().replace(/\.$/, "") === b.toLowerCase().replace(/\.$/, "");

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

	const rows: CheckRow[] = [];
	if (zones.length === 0) {
		rows.push({ id: "dns", title: "dns", status: "ok", detail: "none declared", problems: [] });
	} else if (!loader.has("dns")) {
		const why = whyMissing(loader, "dns", "no `dns` provider to check them with");
		for (const zone of zones) rows.push(row(zone, "skip", why));
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

async function checkZone(dns: Dns, zone: string, wanted: Wanted[]): Promise<CheckRow> {
	try {
		const have = await dns.listRecords(zone);
		const problems = declaredVsActual(
			new Map(wanted.map((w) => [keyOf(w), w])),
			new Map(have.map((h) => [keyOf(h), h])),
			{
				noun: "record",
				flagExtra: false,
				equal: (want, found) =>
					sameContent(want.content, found.content) && (want.proxied !== true || found.proxied === true),
				show: (r) => `${r.content}${r.proxied ? " (proxied)" : ""}`,
			}
		);
		return problems.length > 0
			? row(zone, "fail", `${problems.length} problem(s)`, problems)
			: row(zone, "ok", `${wanted.length} of ${wanted.length} exist`);
	} catch (err) {
		const noToken = missingTokenReason(err);
		return noToken !== undefined ? row(zone, "skip", noToken) : row(zone, "fail", errorMessage(err));
	}
}
