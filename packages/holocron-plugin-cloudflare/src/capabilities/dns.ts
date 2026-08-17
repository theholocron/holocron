import type { Dns, DnsRecord, DnsRecordType } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import type { CloudflareClient } from "../rest.js";

export class CloudflareDns implements Dns {
	readonly key = "dns" as const;
	readonly providerName = "cloudflare";

	// Zone id is cached per domain name for the plugin instance lifetime.
	private readonly zoneCache = new Map<string, string>();

	constructor(private readonly client: CloudflareClient) {}

	async listRecords(domain: string): Promise<DnsRecord[]> {
		const zoneId = await this.resolveZone(domain);
		const records = await this.client.dns.list(zoneId);
		return records.map(mapRecord);
	}

	async upsertRecord(domain: string, record: DnsRecord): Promise<DnsRecord> {
		const zoneId = await this.resolveZone(domain);
		const existing = await this.client.dns.list(zoneId, {
			type: record.type,
			name: record.name,
		});
		if (existing.length > 0) {
			// When multiple same-type records exist (e.g. TXT for SPF + DKIM),
			// update only the first match. Callers managing multiple TXT records
			// should use listRecords + deleteRecord + explicit upserts.
			const updated = await this.client.dns.update(zoneId, existing[0]!.id, {
				type: record.type as Parameters<typeof this.client.dns.update>[2]["type"],
				name: record.name,
				content: record.content,
				...(record.ttl !== undefined ? { ttl: record.ttl } : {}),
			});
			return mapRecord(updated);
		}
		const created = await this.client.dns.create(zoneId, {
			type: record.type as Parameters<typeof this.client.dns.create>[1]["type"],
			name: record.name,
			content: record.content,
			...(record.ttl !== undefined ? { ttl: record.ttl } : {}),
		});
		return mapRecord(created);
	}

	async deleteRecord(domain: string, id: string): Promise<void> {
		const zoneId = await this.resolveZone(domain);
		await this.client.dns.delete(zoneId, id);
	}

	/**
	 * Walk from full domain up to apex to find the Cloudflare zone.
	 * E.g. "api.staging.example.com" tries:
	 *   1. "api.staging.example.com"
	 *   2. "staging.example.com"
	 *   3. "example.com"
	 */
	private async resolveZone(domain: string): Promise<string> {
		const cached = this.zoneCache.get(domain);
		if (cached) return cached;

		const parts = domain.split(".");
		for (let i = 0; i < parts.length - 1; i++) {
			const candidate = parts.slice(i).join(".");
			const zones = await this.client.zones.list({ name: candidate });
			if (zones.length > 0) {
				this.zoneCache.set(domain, zones[0]!.id);
				return zones[0]!.id;
			}
		}
		throw new ProviderApiError(`No Cloudflare zone found for domain: ${domain}`, 404, undefined);
	}
}

function mapRecord(raw: { id: string; type: string; name: string; content: string; ttl: number }): DnsRecord {
	return {
		id: raw.id,
		type: raw.type as DnsRecordType,
		name: raw.name,
		content: raw.content,
		ttl: raw.ttl,
	};
}
