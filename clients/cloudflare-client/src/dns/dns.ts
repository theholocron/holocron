import { cfRequest, type RestClient } from "../utils.js";

/** The DNS record types the client accepts. */
export type CfDnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS" | "SRV" | "CAA";

/** A DNS record in a Cloudflare zone. */
export interface CfDnsRecord {
	/** The record's identifier. */
	id: string;
	/** The record type. */
	type: CfDnsRecordType;
	/** The record's name (hostname). */
	name: string;
	/** The record's content, such as an IP address or target hostname. */
	content: string;
	/** The time to live in seconds; `1` means automatic. */
	ttl: number;
	/** Whether traffic goes through Cloudflare's proxy. */
	proxied: boolean;
}

/** The fields for creating or updating a DNS record. */
export interface CfDnsRecordInput {
	/** The record type. */
	type: CfDnsRecordType;
	/** The record's name (hostname). */
	name: string;
	/** The record's content, such as an IP address or target hostname. */
	content: string;
	/** The time to live in seconds. When creating, defaults to `1` (automatic). */
	ttl?: number;
	/** Whether to proxy traffic through Cloudflare. When creating, defaults to `false`. */
	proxied?: boolean;
}

export function dns(rest: RestClient) {
	return {
		list: (zoneId: string, query?: { type?: string; name?: string }): Promise<CfDnsRecord[]> =>
			cfRequest<CfDnsRecord[]>(rest, "GET", `/zones/${zoneId}/dns_records`, undefined, {
				...(query?.type ? { type: query.type } : {}),
				...(query?.name ? { name: query.name } : {}),
				per_page: "100",
			}),

		create: (zoneId: string, record: CfDnsRecordInput): Promise<CfDnsRecord> =>
			cfRequest<CfDnsRecord>(rest, "POST", `/zones/${zoneId}/dns_records`, {
				type: record.type,
				name: record.name,
				content: record.content,
				ttl: record.ttl ?? 1,
				proxied: record.proxied ?? false,
			}),

		update: (zoneId: string, recordId: string, record: Partial<CfDnsRecordInput>): Promise<CfDnsRecord> =>
			cfRequest<CfDnsRecord>(rest, "PATCH", `/zones/${zoneId}/dns_records/${recordId}`, record),

		delete: (zoneId: string, recordId: string): Promise<{ id: string }> =>
			cfRequest<{ id: string }>(rest, "DELETE", `/zones/${zoneId}/dns_records/${recordId}`),
	};
}
