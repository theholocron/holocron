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

	it("skips every zone, with the reason, when records are expected but there is no dns provider", async () => {
		const { report, lines } = await run(loadedWith({ notifications: ["discord"] }), { notifications: RELAY });
		expect(report.rows.map((r) => r.status)).toEqual(["skip"]);
		expect(report.rows[0]!.detail).toBe("no `dns` provider to check them with");
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 1 skipped");
	});

	it("prints to the console and builds its own loader when none is passed", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorDns({ loaded: loadedWith({}), context: { repoRoot: "/tmp/test" } });
		log.mockRestore();
		expect(report.status).toBe("ok");
	});
});
