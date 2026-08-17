import { cfRequest, type RestClient } from "../utils.js";

export type CfDnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS" | "SRV" | "CAA";

export interface CfDnsRecord {
	id: string;
	type: CfDnsRecordType;
	name: string;
	content: string;
	ttl: number;
	proxied: boolean;
}

export interface CfDnsRecordInput {
	type: CfDnsRecordType;
	name: string;
	content: string;
	ttl?: number;
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
