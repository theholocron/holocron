/**
 * `holocron new domain` — take a DNS record, make it through the `dns` provider, keep it in the list
 * (`.holocron/dns-records.json`) that `setup` re-applies and `doctor dns` checks (spec `tech-new-domain-command`).
 *
 * Provider-neutral: it calls the `dns` capability's `upsertRecord`, so it names no vendor. A record is DNS-only unless
 * `--proxied`, because a vendor reads the record itself to verify the name. It shows what will change, asks first
 * (unless `--yes` or `--dry-run`) and never deletes.
 */

import { NonInteractiveError } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import {
	DNS_ENTRY_TYPES,
	type DnsListEntry,
	readDnsRecords,
	upsertDnsEntry,
	writeDnsRecords,
} from "../../dns-records/index.js";
import { assertPluginsResolvable, type DnsRecord } from "../../plugin/index.js";
import type { NewDomainField, NewDomainReport, RunNewDomainInput } from "./new-domain.type.js";

/** A value as comparable text: no case, no final dot, no quotes around a TXT value. */
const normal = (v: string): string =>
	v
		.trim()
		.replace(/^"(.*)"$/s, "$1")
		.replace(/\.$/, "")
		.toLowerCase();

export async function runNewDomain(input: RunNewDomainInput): Promise<NewDomainReport> {
	const { print, logger, loader } = input;
	await loader.load();
	assertPluginsResolvable(loader, "new domain");
	if (!loader.has("dns")) {
		throw new Error("`dns` capability is not configured: add a `dns` provider to holocron.config");
	}

	const need = async (field: NewDomainField): Promise<string> => {
		const given = input[field];
		if (given !== undefined && given !== "") return given;
		if (!input.ask) throw new NonInteractiveError(`--${field} is required without a terminal`);
		return (await input.ask(field)).trim();
	};
	const type = (await need("type")).toUpperCase();
	const kind = DNS_ENTRY_TYPES.find((t) => t === type);
	if (!kind) throw new Error(`--type must be one of ${DNS_ENTRY_TYPES.join(", ")} (got ${type})`);
	const name = (await need("name")).toLowerCase().replace(/\.$/, "");
	const zone = input.loaded.resolved.domain;
	if (zone && name !== zone && !name.endsWith(`.${zone}`)) {
		throw new Error(`--name must be ${zone} or a name under it (got ${name})`);
	}
	const value = await need("value");
	if (value === "") throw new Error("--value is required");
	const entry: DnsListEntry = {
		type: kind,
		name,
		value,
		...(input.note ? { note: input.note } : {}),
		...(input.proxied ? { proxied: true } : {}),
	};

	const dryRun = input.context.dryRun === true;
	const dns = loader.get("dns");
	const { list, replaced } = upsertDnsEntry(await readDnsRecords(input.context.repoRoot, input.io), entry);
	print(`Holocron new domain — ${entry.type} ${entry.name}${dryRun ? " (dry-run)" : ""}`);

	try {
		const held: DnsRecord[] = (await dns.listRecords(entry.name)).filter(
			(r) => r.type === entry.type && normal(r.name) === normal(entry.name)
		);
		const same = held.some(
			(r) => normal(r.content) === normal(entry.value) && (r.proxied === true) === (entry.proxied ?? false)
		);
		print(
			held.length === 0
				? `  + ${entry.type} ${entry.name} -> ${entry.value} is new`
				: same
					? `  = ${entry.type} ${entry.name} already holds that value`
					: `  ~ ${entry.type} ${entry.name} holds ${held[0].content}; it would become ${entry.value}`
		);
		if (replaced) print(`  ~ the list already has this record (${replaced.value}); its entry is replaced`);

		if (dryRun) return { status: "dry-run", entry, message: "nothing written" };
		if (!input.yes) {
			if (!input.confirm) throw new NonInteractiveError("pass --yes to make the record without a terminal");
			if (
				!(await input.confirm(`Make ${entry.type} ${entry.name} (DNS ${entry.proxied ? "proxied" : "only"})?`))
			) {
				print("  cancelled; nothing written");
				return { status: "cancelled", entry };
			}
		}

		const record: DnsRecord = {
			type: entry.type,
			name: entry.name,
			content: entry.value,
			proxied: entry.proxied ?? false,
		};
		await dns.upsertRecord(entry.name, record);
		await writeDnsRecords(input.context.repoRoot, list, input.io);
		print(`  ✓ made ${entry.type} ${entry.name} via ${dns.providerName}; kept in .holocron/dns-records.json`);
		logger.info({ type: entry.type, name: entry.name, provider: dns.providerName, status: "ok" }, "new domain");
		return { status: "ok", entry };
	} catch (err) {
		if (err instanceof NonInteractiveError) throw err;
		const message = errorMessage(err);
		print(`  ✗ ${message}`);
		logger.warn({ type: entry.type, name: entry.name, reason: message }, "new domain");
		return { status: "fail", entry, message };
	}
}
