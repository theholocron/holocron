import { NonInteractiveError } from "@theholocron/kyber/ui";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { DnsRecordsIo } from "../../dns-records/index.js";
import type { Dns, DnsRecord, PluginLoader } from "../../plugin/index.js";
import { runNewDomain } from "./new-domain.js";
import type { RunNewDomainInput } from "./new-domain.type.js";

const loaded = (domain: string | undefined = "example.dev"): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", providers: {}, ...(domain ? { domain } : {}) } as Parameters<
		typeof resolveConfig
	>[0]),
	filepath: "/tmp/test/holocron.config.json",
});

function fakes(
	opts: { held?: DnsRecord[]; withDns?: boolean; upsert?: () => Promise<unknown>; stored?: string | null } = {}
) {
	const upsert = vi.fn(opts.upsert ?? (async () => ({})));
	const dns = {
		providerName: "cloudflare",
		listRecords: vi.fn(async () => opts.held ?? []),
		upsertRecord: upsert,
	} as unknown as Dns;
	const loader = {
		load: async () => undefined,
		loadedKeys: () => (opts.withDns === false ? [] : ["dns"]),
		loadFailures: () => [],
		has: (k: string) => k === "dns" && opts.withDns !== false,
		get: () => dns,
	} as unknown as PluginLoader;
	const writes: Array<[string, string]> = [];
	const io: DnsRecordsIo = {
		read: async () => opts.stored ?? null,
		write: async (p, t) => void writes.push([p, t]),
	};
	return { loader, io, upsert, writes, dns };
}

const FULL = { type: "cname", name: "Status.example.dev", value: "target.example.net", note: "Checkly dashboard" };

async function run(input: Partial<RunNewDomainInput>, f = fakes()) {
	const lines: string[] = [];
	const report = await runNewDomain({
		loaded: loaded(),
		context: { repoRoot: "/r", dryRun: false },
		loader: f.loader,
		io: f.io,
		print: (l) => lines.push(l),
		logger: fakeLogger(),
		yes: true,
		...FULL,
		...input,
	});
	return { report, lines, ...f };
}

describe("runNewDomain", () => {
	it("makes the record DNS-only and adds it to the list", async () => {
		const { report, upsert, writes } = await run({});
		expect(report.status).toBe("ok");
		expect(upsert).toHaveBeenCalledWith("status.example.dev", {
			type: "CNAME",
			name: "status.example.dev",
			content: "target.example.net",
			proxied: false,
		});
		expect(writes[0]?.[0]).toBe("/r/.holocron/dns-records.json");
		expect(JSON.parse(writes[0]![1])).toEqual([
			{ type: "CNAME", name: "status.example.dev", value: "target.example.net", note: "Checkly dashboard" },
		]);
	});

	it("keeps proxied only when asked, and replaces the entry the list already has", async () => {
		const stored = JSON.stringify([{ type: "CNAME", name: "status.example.dev", value: "old.example.net" }]);
		const { upsert, writes, lines } = await run({ proxied: true }, fakes({ stored }));
		expect(upsert).toHaveBeenCalledWith("status.example.dev", expect.objectContaining({ proxied: true }));
		expect(JSON.parse(writes[0]![1])).toEqual([
			expect.objectContaining({ value: "target.example.net", proxied: true }),
		]);
		expect(lines.join("\n")).toContain("the list already has this record (old.example.net); its entry is replaced");
	});

	it("says what the zone holds: already right, or a different value", async () => {
		const same = await run(
			{},
			fakes({
				held: [{ type: "CNAME", name: "status.example.dev", content: "TARGET.example.net.", proxied: false }],
			})
		);
		expect(same.lines.join("\n")).toContain("already holds that value");
		const other = await run(
			{},
			fakes({ held: [{ type: "CNAME", name: "status.example.dev", content: "elsewhere.net" }] })
		);
		expect(other.lines.join("\n")).toContain("holds elsewhere.net; it would become target.example.net");
	});

	it("writes nothing on a dry run", async () => {
		const { report, upsert, writes } = await run({ context: { repoRoot: "/r", dryRun: true } });
		expect(report.status).toBe("dry-run");
		expect(upsert).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
	});

	it("asks first, and writes nothing when the answer is no", async () => {
		const confirm = vi.fn(async () => false);
		const { report, upsert, writes } = await run({ yes: false, confirm });
		expect(confirm).toHaveBeenCalledWith("Make CNAME status.example.dev (DNS only)?");
		expect(report.status).toBe("cancelled");
		expect(upsert).not.toHaveBeenCalled();
		expect(writes).toEqual([]);
	});

	it("names a proxied record in the question, and keeps no note when none is given", async () => {
		const confirm = vi.fn(async () => true);
		const { writes } = await run({ yes: false, confirm, proxied: true, note: undefined });
		expect(confirm).toHaveBeenCalledWith("Make CNAME status.example.dev (DNS proxied)?");
		expect(JSON.parse(writes[0]![1])[0]).not.toHaveProperty("note");
	});

	it("goes on when the answer is yes", async () => {
		const { report } = await run({ yes: false, confirm: async () => true });
		expect(report.status).toBe("ok");
	});

	it("refuses without a terminal and without --yes", async () => {
		const err = await run({ yes: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it("asks for a field a flag left out, and refuses when there is nobody to ask", async () => {
		const ask = vi.fn(async () => "target.example.net");
		const { report } = await run({ value: undefined, ask });
		expect(ask).toHaveBeenCalledWith("value");
		expect(report.status).toBe("ok");
		const err = await run({ value: undefined }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
	});

	it.each([
		["a type the list does not take", { type: "MX" }, /--type must be one of/],
		[
			"a name outside the org's domain",
			{ name: "status.other.dev" },
			/--name must be example.dev or a name under it/,
		],
		["an empty value asked for", { value: undefined, ask: async () => "" }, /--value is required/],
	])("rejects %s", async (_n, patch, message) => {
		const err = await run(patch as Partial<RunNewDomainInput>).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(message);
	});

	it("takes any name when the config names no domain", async () => {
		const { report } = await run({ loaded: loaded(""), name: "x.other.dev" });
		expect(report.status).toBe("ok");
	});

	it("fails with the provider's message and keeps the list as it was", async () => {
		const { report, writes } = await run(
			{},
			fakes({ upsert: async () => Promise.reject(new Error("zone not found")) })
		);
		expect(report).toMatchObject({ status: "fail", message: "zone not found" });
		expect(writes).toEqual([]);
	});

	it("needs a dns provider", async () => {
		const err = await run({}, fakes({ withDns: false })).catch((e: unknown) => e);
		expect((err as Error).message).toContain("`dns` capability is not configured");
	});
});
