import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDoctorDns } from "./doctor-dns.js";

type Raw = Parameters<typeof resolveConfig>[0];

const RELAY = {
	providerName: "discord",
	layout: { relay: { host: "comlink.example.dev", zone: "example.dev" } },
};

const loadedWith = (providers: Record<string, unknown>, extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", providers, ...extra } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

/** One fake plugin package per provider, exposing the capabilities the test gives it. */
function loaderWith(loaded: LoadedConfig, caps: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		const keys = Object.keys(caps).filter((k) => pkg === `@theholocron/holocron-plugin-${PACKAGES[k]}`);
		if (keys.length === 0) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: pkg,
				capabilities: Object.fromEntries(keys.map((k) => [k, () => caps[k]])),
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

const PACKAGES: Record<string, string> = {
	dns: "cloudflare",
	deployment: "cloudflare",
	notifications: "discord",
	wiki: "fern",
};

async function run(loaded: LoadedConfig, caps: Record<string, unknown>) {
	const lines: string[] = [];
	const report = await runDoctorDns({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(loaded, caps),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const WITH_RELAY = { dns: "cloudflare", notifications: ["discord"] };
const relayRecord = { type: "AAAA", name: "comlink.example.dev", content: "100::", proxied: true };
const dns = (records: unknown[]) => ({ providerName: "cloudflare", listRecords: vi.fn(async () => records) });

describe("doctor dns", () => {
	it("says none declared when the config makes setup write no record", async () => {
		const { report, lines } = await run(loadedWith({}), {});
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([["dns", "ok", "none declared"]]);
		expect(report.status).toBe("ok");
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("ignores a notifications provider with no layout", async () => {
		const { report } = await run(loadedWith(WITH_RELAY), {
			dns: dns([]),
			notifications: { providerName: "discord" },
		});
		expect(report.rows[0]).toMatchObject({ status: "ok", detail: "none declared" });
	});

	it("passes when the expected records exist, whatever the case and a final dot, and ignores extra ones", async () => {
		const provider = dns([
			{ ...relayRecord, name: "COMLINK.example.dev.", content: "100::" },
			{ type: "A", name: "other.example.dev", content: "1.2.3.4" },
		]);
		const { report } = await run(loadedWith(WITH_RELAY), { dns: provider, notifications: RELAY });
		expect(provider.listRecords).toHaveBeenCalledWith("example.dev");
		expect(report.rows[0]).toMatchObject({ id: "dns-example.dev", status: "ok", detail: "1 of 1 exist" });
		expect(report.rows[0]!.title).toBe("example.dev records exist");
	});

	it("fails a missing record, a record pointing elsewhere and one that is not proxied where it must be", async () => {
		const config = loadedWith({ ...WITH_RELAY, wiki: "fern" });
		const wiki = {
			dnsRecord: () => ({
				zone: "example.dev",
				record: { type: "CNAME", name: "docs.example.dev", content: "fern.example" },
			}),
			proxyConfig: () => ({ target: "https://x", headers: {} }),
		};
		const provider = dns([
			{ type: "AAAA", name: "comlink.example.dev", content: "100::", proxied: false },
			{ type: "CNAME", name: "docs.example.dev", content: "elsewhere.example", proxied: true },
		]);
		const { report } = await run(config, { dns: provider, notifications: RELAY, wiki });
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.problems).toEqual([
			"record CNAME docs.example.dev: declared fern.example (proxied), found elsewhere.example (proxied)",
			"record AAAA comlink.example.dev: declared 100:: (proxied), found 100::",
		]);
	});

	it("reports a record that is missing altogether", async () => {
		const { report } = await run(loadedWith(WITH_RELAY), { dns: dns([]), notifications: RELAY });
		expect(report.rows[0]!.problems).toEqual(["missing record AAAA comlink.example.dev"]);
	});

	it("checks the preview domain's CNAMEs on a Cloudflare deployment, one row per zone", async () => {
		const config = loadedWith(
			{ dns: "cloudflare", deployment: "cloudflare", notifications: ["discord"] },
			{
				tasks: [
					{ name: "delivery.deploy", with: { preview: { project: "pv", domain: "preview.example.dev" } } },
				],
			}
		);
		const listRecords = vi.fn(async (zone: string) =>
			zone === "preview.example.dev"
				? [{ type: "CNAME", name: "preview.example.dev", content: "pv.pages.dev" }]
				: [relayRecord]
		);
		const { report } = await run(config, {
			dns: { providerName: "cloudflare", listRecords },
			notifications: RELAY,
			deployment: { providerName: "cloudflare" },
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([
			["dns-preview.example.dev", "fail"],
			["dns-example.dev", "ok"],
		]);
		expect(report.rows[0]!.problems).toEqual(["missing record CNAME *.preview.example.dev"]);
	});

	it("fails a zone whose read throws, with the message, and skips one the provider has no token for", async () => {
		const failing = await run(loadedWith(WITH_RELAY), {
			dns: {
				providerName: "cloudflare",
				listRecords: async () => {
					throw new Error("403 Forbidden");
				},
			},
			notifications: RELAY,
		});
		expect(failing.report.rows[0]).toMatchObject({ status: "fail", detail: "403 Forbidden" });
		const skipped = await run(loadedWith(WITH_RELAY), {
			dns: {
				providerName: "cloudflare",
				listRecords: async () => {
					throw new MissingTokenError("needs the dns token");
				},
			},
			notifications: RELAY,
		});
		expect(skipped.report.status).toBe("skip");
		expect(skipped.report.reason).toBe("needs the dns token");
	});

	it("skips when the dns plugin reports its token missing as an AuthError", async () => {
		const { report } = await run(loadedWith(WITH_RELAY), {
			dns: {
				providerName: "cloudflare",
				listRecords: async () => {
					throw Object.assign(new Error("no Cloudflare token found"), { name: "AuthError" });
				},
			},
			notifications: RELAY,
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no Cloudflare token found");
	});

	it("skips every zone, with the reason, when records are expected but there is no dns provider", async () => {
		const { report, lines } = await run(loadedWith({ notifications: ["discord"] }), { notifications: RELAY });
		expect(report.rows.map((r) => r.status)).toEqual(["skip"]);
		expect(report.rows[0]!.detail).toBe("no `dns` provider to check them with");
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 1 skipped");
	});

	describe("a deployment provider's custom domain", () => {
		const HOST = "sentinel.example.dev";
		const TARGET = "abc123.vercel-dns-017.com";
		const config = () => loadedWith({ dns: "cloudflare", deployment: "cloudflare" });
		const request = { zone: HOST, record: { type: "CNAME", name: HOST, content: TARGET, proxied: false } };
		const deployment = (read: () => Promise<unknown> = async () => request) => ({
			providerName: "vercel",
			domain: HOST,
			expectedDomainRecord: vi.fn(read),
			ensureCustomDomain: vi.fn(),
		});
		const cname = (extra: Record<string, unknown> = {}) => ({
			type: "CNAME",
			name: HOST,
			content: TARGET,
			...extra,
		});

		it("passes when the record points at the target Vercel recommends and is DNS-only, without creating anything", async () => {
			const provider = deployment();
			const records = dns([cname({ proxied: false })]);
			const { report } = await run(config(), { dns: records, deployment: provider });
			expect(report.rows).toEqual([
				{
					id: `dns-domain-${HOST}`,
					title: `${HOST} points at the deployment, DNS-only`,
					status: "ok",
					detail: "1 of 1 exist",
					problems: [],
				},
			]);
			expect(provider.expectedDomainRecord).toHaveBeenCalledWith("demo", HOST);
			expect(provider.ensureCustomDomain).not.toHaveBeenCalled();
			expect(records.listRecords).toHaveBeenCalledWith(HOST);
		});

		it("fails a record that was deleted, repointed or proxied", async () => {
			const missing = await run(config(), { dns: dns([]), deployment: deployment() });
			expect(missing.report.rows[0]!.problems).toEqual([`missing record CNAME ${HOST}`]);
			const repointed = await run(config(), {
				dns: dns([cname({ content: "elsewhere.example" })]),
				deployment: deployment(),
			});
			expect(repointed.report.rows[0]!.problems).toEqual([
				`record CNAME ${HOST}: declared ${TARGET}, found elsewhere.example`,
			]);
			const proxied = await run(config(), { dns: dns([cname({ proxied: true })]), deployment: deployment() });
			expect(proxied.report.status).toBe("fail");
			expect(proxied.report.rows[0]!.problems).toEqual([
				`record CNAME ${HOST}: declared ${TARGET}, found ${TARGET} (proxied)`,
			]);
		});

		it("skips when the provider recommends no record, or when its token is missing", async () => {
			const none = await run(config(), { dns: dns([]), deployment: deployment(async () => null) });
			expect(none.report.rows[0]).toMatchObject({ status: "skip", detail: "vercel recommends no record for it" });
			const noToken = await run(config(), {
				dns: dns([]),
				deployment: deployment(async () => {
					throw Object.assign(new Error("no Vercel token found"), { name: "AuthError" });
				}),
			});
			expect(noToken.report.status).toBe("skip");
			expect(noToken.report.reason).toBe("no Vercel token found");
		});

		it("fails when the provider read throws", async () => {
			const { report } = await run(config(), {
				dns: dns([]),
				deployment: deployment(async () => {
					throw new Error("500 from Vercel");
				}),
			});
			expect(report.rows[0]).toMatchObject({ status: "fail", detail: "500 from Vercel" });
		});

		it("skips when there is no dns provider to compare with", async () => {
			const { report } = await run(loadedWith({ deployment: "cloudflare" }), { deployment: deployment() });
			expect(report.rows.map((r) => [r.id, r.status])).toEqual([[`dns-domain-${HOST}`, "skip"]]);
		});

		it("reads the preview domain with the preview project, and nothing for a provider that cannot be asked", async () => {
			const previewConfig = loadedWith(
				{ dns: "cloudflare", deployment: "cloudflare" },
				{
					tasks: [
						{
							name: "delivery.deploy",
							with: { preview: { project: "pv", domain: "preview.example.dev" } },
						},
					],
				}
			);
			const provider = deployment();
			await run(previewConfig, { dns: dns([]), deployment: provider });
			expect(provider.expectedDomainRecord).toHaveBeenCalledWith("pv", "preview.example.dev");
			expect(provider.expectedDomainRecord).toHaveBeenCalledTimes(1);

			const noRead = await run(config(), { dns: dns([]), deployment: { providerName: "x", domain: HOST } });
			expect(noRead.report.rows[0]).toMatchObject({ id: "dns", detail: "none declared" });
			const noDomain = await run(config(), {
				dns: dns([]),
				deployment: { providerName: "x", expectedDomainRecord: vi.fn() },
			});
			expect(noDomain.report.rows[0]).toMatchObject({ id: "dns", detail: "none declared" });
			const previewNoDomain = await run(
				loadedWith(
					{ dns: "cloudflare", deployment: "cloudflare" },
					{ tasks: [{ name: "delivery.deploy", with: { preview: { project: "pv" } } }] }
				),
				{ dns: dns([]), deployment: deployment() }
			);
			expect(previewNoDomain.report.rows[0]).toMatchObject({ id: "dns", detail: "none declared" });
		});
	});

	describe("the docs domain and the mail records", () => {
		const loaded = () =>
			loadedWith(
				{ dns: "cloudflare" },
				{
					org: "acme",
					domain: "example.dev",
					docs: { build: "workflow", domain: "docs.example.dev" },
					doctor: { mail: "icloud" },
				}
			);
		const mail = [
			{ type: "MX", name: "example.dev", content: "mx01.mail.icloud.com." },
			{ type: "MX", name: "example.dev", content: "MX02.mail.icloud.com" },
			{ type: "TXT", name: "example.dev", content: '"v=spf1 include:icloud.com ~all"' },
			{ type: "TXT", name: "example.dev", content: "apple-domain=abc" },
		];
		const docsRecord = { type: "CNAME", name: "docs.example.dev", content: "acme.github.io", proxied: false };

		it("passes with the docs CNAME and the MX and SPF records, whatever the quoting, and ignores other TXT records", async () => {
			const { report } = await run(loaded(), { dns: dns([docsRecord, ...mail]) });
			expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
				["dns-docs.example.dev", "ok", "1 of 1 exist"],
				["dns-example.dev", "ok", "3 of 3 exist"],
			]);
		});

		it("fails a missing exchanger, a changed SPF value and a docs record that is proxied", async () => {
			const { report } = await run(loaded(), {
				dns: dns([{ ...docsRecord, proxied: true }, mail[0], { ...mail[2], content: "v=spf1 -all" }]),
			});
			expect(report.rows[0]!.problems).toEqual([
				"record CNAME docs.example.dev: declared acme.github.io, found acme.github.io (proxied)",
			]);
			expect(report.rows[1]!.problems).toEqual([
				"missing record MX example.dev mx02.mail.icloud.com",
				"missing record TXT example.dev v=spf1 include:icloud.com ~all",
			]);
		});
	});

	it("prints to the console and builds its own loader when none is passed", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorDns({ loaded: loadedWith({}), context: { repoRoot: "/tmp/test" } });
		log.mockRestore();
		expect(report.status).toBe("ok");
	});
});
