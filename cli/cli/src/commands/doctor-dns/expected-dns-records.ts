import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { Deployment, NotificationsLayout, Wiki } from "../../plugin/index.js";
import { relayZone } from "../notifications-setup/relay.js";
import { previewConfigOf } from "../setup/preview-config-of.js";
import type { ExpectedDnsRecord } from "./doctor-dns.type.js";

/** What the providers loaded for the config can say about the records they cause. */
export interface DnsRecordSources {
	deployment?: Pick<Deployment, "providerName">;
	wiki?: Pick<Wiki, "dnsRecord" | "proxyConfig">;
	layouts: NotificationsLayout[];
}

/**
 * The DNS records the config makes `holocron repo setup` and `notifications setup` write, as far as they can be
 * known without writing anything: the preview domain's apex and wildcard CNAMEs (on a Cloudflare deployment), the
 * docs host a wiki provider asks for, and the relay Worker's proxied placeholder. A record that
 * `Deployment.ensureCustomDomain()` returns is left out, since asking for it creates the domain.
 */
export function expectedDnsRecords(config: ResolvedHolocronConfig, sources: DnsRecordSources): ExpectedDnsRecord[] {
	const expected: ExpectedDnsRecord[] = [];

	const preview = previewConfigOf(config);
	if (preview?.domain && sources.deployment?.providerName === "cloudflare") {
		const content = `${preview.project}.pages.dev`;
		for (const name of [preview.domain, `*.${preview.domain}`]) {
			expected.push({ zone: preview.domain, record: { type: "CNAME", name, content } });
		}
	}

	const docs = sources.wiki?.dnsRecord?.();
	if (docs) {
		const { type, name, content } = docs.record;
		expected.push({
			zone: docs.zone,
			record: { type, name, content, ...(sources.wiki?.proxyConfig?.() ? { proxied: true } : {}) },
		});
	}

	for (const { relay } of sources.layouts) {
		if (relay) {
			expected.push({
				zone: relayZone(relay),
				record: { type: "AAAA", name: relay.host, content: "100::", proxied: true },
			});
		}
	}
	return expected;
}
