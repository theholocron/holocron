import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ProbeContext, ProbeRow } from "../../plugin/index.js";
import type { PluginLoader } from "../../plugin/index.js";
import { comlinkProbes } from "./comlink-probes.js";

function ctxFor(dryRun = false) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const writes: string[] = [];
	const ctx: ProbeContext = {
		dryRun,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async (label, fn) => {
			writes.push(dryRun ? `would ${label}` : label);
			return dryRun ? undefined : fn();
		},
		cleanup: () => {},
	};
	return { ctx, rows, secrets, writes };
}

function loaderWith(
	over: {
		layout?: unknown;
		errors?: unknown;
		workers?: unknown;
		vault?: unknown;
		skip?: string[];
	} = {}
) {
	const caps: Record<string, unknown> = {
		notifications: [
			{
				providerName: "discord",
				layout: "layout" in over ? over.layout : { relay: { host: "comlink.example.dev" } },
			},
		],
		errors: "errors" in over ? over.errors : { providerName: "sentry" },
		workers: over.workers,
		vault: over.vault,
	};
	for (const k of over.skip ?? []) delete caps[k];
	return {
		has: (k: string) => caps[k] !== undefined,
		get: (k: string) => caps[k],
	} as unknown as PluginLoader;
}

const res = (status: number) => new Response(null, { status });
const fetchSeq = (...statuses: number[]) => {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return res(statuses[calls.length - 1] ?? 200);
	});
	return { fn: fn as unknown as typeof fetch, calls };
};

describe("probe comlink unsigned", () => {
	it("is ok when the relay refuses each kind of request the way it should", async () => {
		const { fn, calls } = fetchSeq(405, 401, 404);
		const { ctx, rows } = ctxFor();
		await comlinkProbes({ loader: loaderWith(), fetch: fn }).unsigned!.run(ctx);
		expect(rows.map((r) => [r.status, r.label, r.detail])).toEqual([
			["ok", "GET /sentry", "405"],
			["ok", "unsigned POST /sentry", "401"],
			["ok", "POST /no-such-source", "404"],
		]);
		expect(calls.map((c) => [c.init?.method ?? "GET", c.url])).toEqual([
			["GET", "https://comlink.example.dev/sentry"],
			["POST", "https://comlink.example.dev/sentry"],
			["POST", "https://comlink.example.dev/no-such-source"],
		]);
	});

	it("fails what is wrong and says a 404 on a real source means the Worker is not there", async () => {
		const { fn } = fetchSeq(404, 200, 404);
		const { ctx, rows } = ctxFor();
		await comlinkProbes({ loader: loaderWith(), fetch: fn }).unsigned!.run(ctx);
		expect(rows[0]).toMatchObject({
			status: "fail",
			detail: "got 404, wanted 405 (is the Worker deployed on this host?)",
		});
		expect(rows[1]).toMatchObject({ status: "fail", detail: "got 200, wanted 401" });
		expect(rows[2]!.status).toBe("ok");
	});

	it("says what is missing when no relay is declared", async () => {
		const run = (loader: PluginLoader) => comlinkProbes({ loader }).unsigned!.run(ctxFor().ctx);
		await expect(run(loaderWith({ layout: { categories: [] } }))).rejects.toThrow(/relay\.host/);
		await expect(run(loaderWith({ layout: undefined }))).rejects.toThrow(/relay\.host/);
		await expect(run(loaderWith({ skip: ["errors"] }))).rejects.toThrow(/errors/);
	});

	it("takes the first provider when a loader gives a list, and uses the global fetch when none is injected", async () => {
		const { fn, calls } = fetchSeq(405, 401, 404);
		vi.stubGlobal("fetch", fn);
		try {
			await comlinkProbes({ loader: loaderWith({ errors: [{ providerName: "Sentry" }] }) }).unsigned!.run(
				ctxFor().ctx
			);
			expect(calls[0]!.url).toBe("https://comlink.example.dev/sentry");
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("probe comlink bindings", () => {
	const workers = (names: string[]) => ({ secretNames: vi.fn(async (_script: string) => names) });

	it("is ok when both bindings are there, and shows any other secrets by name", async () => {
		const w = workers(["COMLINK_SENTRY_WEBHOOK", "COMLINK_SENTRY_SECRET", "OTHER"]);
		const { ctx, rows } = ctxFor();
		await comlinkProbes({ loader: loaderWith({ workers: w }) }).bindings!.run(ctx);
		expect(w.secretNames).toHaveBeenCalledWith("comlink");
		expect(rows.map((r) => [r.status, r.label])).toEqual([
			["ok", "COMLINK_SENTRY_WEBHOOK"],
			["ok", "COMLINK_SENTRY_SECRET"],
			["info", "other secrets"],
		]);
		expect(rows[2]!.detail).toBe("OTHER");
	});

	it("fails a missing binding and says what fixes it; uses the layout's script name", async () => {
		const w = workers([]);
		const { ctx, rows } = ctxFor();
		await comlinkProbes({
			loader: loaderWith({ workers: w, layout: { relay: { host: "h", script: "relay-worker" } } }),
		}).bindings!.run(ctx);
		expect(w.secretNames).toHaveBeenCalledWith("relay-worker");
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ status: "fail", detail: expect.stringContaining("notifications setup") });
		expect(rows[1]).toMatchObject({ status: "fail", detail: expect.stringContaining("secrets sync") });
	});

	it("needs a workers provider that can list secrets", async () => {
		await expect(
			comlinkProbes({ loader: loaderWith({ skip: ["workers"] }) }).bindings!.run(ctxFor().ctx)
		).rejects.toThrow(/cannot list/);
		await expect(
			comlinkProbes({ loader: loaderWith({ workers: {} }) }).bindings!.run(ctxFor().ctx)
		).rejects.toThrow(/cannot list/);
	});
});

describe("probe comlink deliver", () => {
	const SECRET = "signing-secret-value";

	it("signs the body it sends with the secret from the environment, and reports the embed to look for", async () => {
		const { fn, calls } = fetchSeq(202);
		const { ctx, rows, secrets } = ctxFor();
		await comlinkProbes({ loader: loaderWith(), fetch: fn, env: { COMLINK_SENTRY_SECRET: SECRET } }).deliver!.run(
			ctx
		);
		const sent = calls[0]!;
		const headers = sent.init!.headers as Record<string, string>;
		expect(sent.url).toBe("https://comlink.example.dev/sentry");
		expect(headers["sentry-hook-resource"]).toBe("event_alert");
		expect(headers["sentry-hook-signature"]).toBe(
			createHmac("sha256", SECRET).update(String(sent.init!.body)).digest("hex")
		);
		expect(String(sent.init!.body)).toContain("Holocron probe: Comlink delivery check");
		expect(secrets).toEqual([SECRET]);
		expect(rows[0]).toMatchObject({ status: "ok", label: "the relay accepted it" });
		expect(JSON.stringify(rows)).not.toContain(SECRET);
	});

	it("reads the secret from the vault when the environment lacks it", async () => {
		const read = vi.fn(async (_name: string) => SECRET);
		const { fn, calls } = fetchSeq(202);
		await comlinkProbes({ loader: loaderWith({ vault: { read } }), fetch: fn, env: {} }).deliver!.run(ctxFor().ctx);
		expect(read).toHaveBeenCalledWith("COMLINK_SENTRY_SECRET");
		expect(calls).toHaveLength(1);
	});

	it("says how to supply the secret when there is none, or the vault cannot read it", async () => {
		const none = comlinkProbes({ loader: loaderWith(), env: {} }).deliver!.run(ctxFor().ctx);
		await expect(none).rejects.toThrow(/no signing secret: set COMLINK_SENTRY_SECRET/);
		const failing = loaderWith({ vault: { read: async () => Promise.reject(new Error("nope")) } });
		await expect(comlinkProbes({ loader: failing, env: {} }).deliver!.run(ctxFor().ctx)).rejects.toThrow(
			/no signing secret/
		);
	});

	it("explains each way the relay can refuse", async () => {
		const rowFor = async (status: number) => {
			const { fn } = fetchSeq(status);
			const { ctx, rows } = ctxFor();
			await comlinkProbes({
				loader: loaderWith(),
				fetch: fn,
				env: { COMLINK_SENTRY_SECRET: SECRET },
			}).deliver!.run(ctx);
			return rows[0]!;
		};
		expect(await rowFor(401)).toMatchObject({
			status: "fail",
			detail: "the signing secret does not match the Worker's",
		});
		expect(await rowFor(502)).toMatchObject({ status: "fail", detail: "the relay could not post to Discord" });
		expect(await rowFor(500)).toMatchObject({
			status: "fail",
			label: "the relay answered 500, not 202",
			detail: "see the Worker's logs",
		});
	});

	it("sends nothing on a dry run", async () => {
		const { fn } = fetchSeq(202);
		const { ctx, rows } = ctxFor(true);
		await comlinkProbes({ loader: loaderWith(), fetch: fn, env: { COMLINK_SENTRY_SECRET: SECRET } }).deliver!.run(
			ctx
		);
		expect(fn).not.toHaveBeenCalled();
		expect(rows).toEqual([{ status: "info", label: "would send a signed test alert to the relay" }]);
	});

	it("needs no secret to say what it would do on a dry run", async () => {
		const { ctx, rows } = ctxFor(true);
		await comlinkProbes({ loader: loaderWith(), env: {} }).deliver!.run(ctx);
		expect(rows).toEqual([{ status: "info", label: "would send a signed test alert to the relay" }]);
	});

	it("only signs a Sentry delivery", async () => {
		const loader = loaderWith({ errors: { providerName: "other" } });
		await expect(
			comlinkProbes({ loader, env: { COMLINK_OTHER_SECRET: SECRET } }).deliver!.run(ctxFor().ctx)
		).rejects.toThrow(/not a other one/);
	});

	it("reads the real environment when none is injected", async () => {
		vi.stubEnv("COMLINK_SENTRY_SECRET", SECRET);
		const { fn } = fetchSeq(202);
		try {
			const { ctx, rows } = ctxFor();
			await comlinkProbes({ loader: loaderWith(), fetch: fn }).deliver!.run(ctx);
			expect(rows[0]!.status).toBe("ok");
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

describe("comlinkProbes", () => {
	it("offers three probes, and only deliver writes", () => {
		const probes = comlinkProbes({ loader: loaderWith() });
		expect(Object.keys(probes).sort()).toEqual(["bindings", "deliver", "unsigned"]);
		expect(Object.values(probes).filter((p) => p.writes)).toHaveLength(1);
		expect(probes.deliver!.writes).toBe(true);
	});
});
