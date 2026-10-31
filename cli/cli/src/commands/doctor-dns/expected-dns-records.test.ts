import { describe, expect, it } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { NotificationsLayout } from "../../plugin/index.js";
import { expectedDnsRecords } from "./expected-dns-records.js";

type Raw = Parameters<typeof resolveConfig>[0];

const configOf = (extra: Record<string, unknown>) => resolveConfig({ name: "demo", providers: {}, ...extra } as Raw);

const preview = (domain: string | undefined) =>
	configOf({
		tasks: [{ name: "delivery.deploy", with: { preview: { project: "pv", ...(domain ? { domain } : {}) } } }],
	});

const CLOUDFLARE = { providerName: "cloudflare" };

describe("expectedDnsRecords", () => {
	it("expects nothing from a config that writes no records", () => {
		expect(expectedDnsRecords(configOf({}), { layouts: [] })).toEqual([]);
	});

	it("expects the preview domain's apex and wildcard CNAMEs to the Pages project, on Cloudflare", () => {
		expect(expectedDnsRecords(preview("preview.example.dev"), { deployment: CLOUDFLARE, layouts: [] })).toEqual([
			{
				zone: "preview.example.dev",
				record: { type: "CNAME", name: "preview.example.dev", content: "pv.pages.dev" },
			},
			{
				zone: "preview.example.dev",
				record: { type: "CNAME", name: "*.preview.example.dev", content: "pv.pages.dev" },
			},
		]);
	});

	it("leaves the preview records out for another deployment provider, no deployment or no preview domain", () => {
		expect(
			expectedDnsRecords(preview("preview.example.dev"), { deployment: { providerName: "vercel" }, layouts: [] })
		).toEqual([]);
		expect(expectedDnsRecords(preview("preview.example.dev"), { layouts: [] })).toEqual([]);
		expect(expectedDnsRecords(preview(undefined), { deployment: CLOUDFLARE, layouts: [] })).toEqual([]);
	});

	it("expects the record a wiki provider asks for, proxied when it proxies", () => {
		const record = { type: "CNAME" as const, name: "docs.example.dev", content: "fern.example", ttl: 1 };
		const config = configOf({});
		expect(
			expectedDnsRecords(config, { wiki: { dnsRecord: () => ({ zone: "example.dev", record }) }, layouts: [] })
		).toEqual([
			{ zone: "example.dev", record: { type: "CNAME", name: "docs.example.dev", content: "fern.example" } },
		]);
		expect(
			expectedDnsRecords(config, {
				wiki: {
					dnsRecord: () => ({ zone: "example.dev", record }),
					proxyConfig: () => ({ target: "https://app.example", headers: {} }),
				},
				layouts: [],
			})
		).toEqual([
			{
				zone: "example.dev",
				record: { type: "CNAME", name: "docs.example.dev", content: "fern.example", proxied: true },
			},
		]);
		expect(expectedDnsRecords(config, { wiki: { dnsRecord: () => null }, layouts: [] })).toEqual([]);
		expect(expectedDnsRecords(config, { wiki: {}, layouts: [] })).toEqual([]);
	});

	it("expects each layout's relay host to be a proxied placeholder, in its zone or its own", () => {
		const layouts: NotificationsLayout[] = [
			{ relay: { host: "comlink.example.dev", zone: "example.dev" } },
			{ relay: { host: "relay.other.dev" } },
			{},
		];
		expect(expectedDnsRecords(configOf({}), { layouts })).toEqual([
			{
				zone: "example.dev",
				record: { type: "AAAA", name: "comlink.example.dev", content: "100::", proxied: true },
			},
			{
				zone: "relay.other.dev",
				record: { type: "AAAA", name: "relay.other.dev", content: "100::", proxied: true },
			},
		]);
	});
});
