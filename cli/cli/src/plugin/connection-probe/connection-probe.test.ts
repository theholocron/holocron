import { describe, expect, it, vi } from "vitest";

import type { ProbeContext, ProbeRow } from "../probe/index.js";
import { connectionProbe, type ConnectionProbeInput, describeNetworkError } from "./connection-probe.js";

function ctx() {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe: ProbeContext = {
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	};
	return { probe, rows, secrets };
}

const base = (over: Partial<ConnectionProbeInput> = {}): ConnectionProbeInput => ({
	provider: "Demo",
	url: "https://api.demo.test/v1",
	token: () => "tok-123",
	verify: async () => ({ ok: true, subject: "user: someone" }),
	fetch: vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
	lookup: async () => ({ address: "203.0.113.7" }),
	...over,
});

const err = (code: string, message = "boom", top = false) =>
	top
		? Object.assign(new Error(message), { code })
		: Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(message), { code }) });

describe("connectionProbe", () => {
	it("is read-only and says what it is for", () => {
		const p = connectionProbe(base());
		expect(p.writes).toBe(false);
		expect(p.summary).toContain("Demo");
	});

	it("is ok all the way down, counting a 401 from the host as the host answering", async () => {
		const { probe, rows, secrets } = ctx();
		await connectionProbe(base()).run(probe);
		expect(rows.map((r) => [r.status, r.label])).toEqual([
			["ok", "DNS api.demo.test"],
			["ok", "reach api.demo.test"],
			["ok", "token"],
			["ok", "accepted"],
		]);
		expect(rows[0]!.detail).toBe("203.0.113.7");
		expect(rows[1]!.detail).toMatch(/^HTTP 401 in \d+ ms$/);
		expect(rows[3]!.detail).toBe("user: someone");
		expect(secrets).toEqual(["tok-123"]);
		expect(JSON.stringify(rows)).not.toContain("tok-123");
	});

	it("fails DNS and does not try the steps that need it", async () => {
		const { probe, rows } = ctx();
		const fetchFn = vi.fn();
		await connectionProbe(
			base({
				lookup: async () => Promise.reject(err("ENOTFOUND", "x", true)),
				fetch: fetchFn as unknown as typeof fetch,
			})
		).run(probe);
		expect(fetchFn).not.toHaveBeenCalled();
		expect(rows.map((r) => r.status)).toEqual(["fail", "info", "ok", "info"]);
		expect(rows[0]!.detail).toContain("did not resolve");
		expect(rows[3]!.detail).toContain("could not be reached");
	});

	it("fails reaching the host with the cause from fetch, and skips the credential check", async () => {
		const { probe, rows } = ctx();
		const verify = vi.fn();
		await connectionProbe(
			base({
				fetch: (async () => Promise.reject(err("ECONNREFUSED"))) as unknown as typeof fetch,
				verify,
			})
		).run(probe);
		expect(rows[1]).toMatchObject({ status: "fail", detail: expect.stringContaining("refused") });
		expect(verify).not.toHaveBeenCalled();
	});

	it("says what is missing when there is no token, and still reports the network", async () => {
		const { probe, rows, secrets } = ctx();
		await connectionProbe(
			base({
				token: () => {
					throw new Error("no Demo token found. Run: holocron auth set demo <TOKEN>");
				},
			})
		).run(probe);
		expect(rows[2]).toMatchObject({
			status: "fail",
			label: "token",
			detail: expect.stringContaining("auth set demo"),
		});
		expect(rows[3]).toMatchObject({ status: "info", detail: "not tried: there is no token" });
		expect(secrets).toEqual([]);
	});

	it("reports a token the provider refuses", async () => {
		const { probe, rows } = ctx();
		await connectionProbe(base({ verify: async () => ({ ok: false, message: "401 Unauthorized" }) })).run(probe);
		expect(rows[3]).toMatchObject({ status: "fail", label: "accepted", detail: "401 Unauthorized" });
	});

	it("checks only the token for a provider with no API host", async () => {
		const { probe, rows } = ctx();
		await connectionProbe(base({ url: undefined })).run(probe);
		expect(rows.map((r) => r.label)).toEqual(["token", "accepted"]);
	});

	it("makes no name lookup when a fetch stands in for the network", async () => {
		const { probe, rows } = ctx();
		await connectionProbe(base({ lookup: undefined })).run(probe);
		expect(rows.map((r) => r.label)).toEqual(["reach api.demo.test", "token", "accepted"]);
	});

	it("uses the system resolver and the global fetch when none are injected", async () => {
		const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchFn);
		try {
			const { probe, rows } = ctx();
			await connectionProbe(base({ url: "http://localhost/", lookup: undefined, fetch: undefined })).run(probe);
			expect(rows[0]!.status).toBe("ok");
			expect(fetchFn).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("describeNetworkError", () => {
	const d = (e: unknown) => describeNetworkError(e, 10_000);
	it("names the usual causes in plain words", () => {
		expect(d(Object.assign(new Error("t"), { name: "TimeoutError" }))).toContain("no answer within 10s");
		expect(d(err("UND_ERR_CONNECT_TIMEOUT"))).toContain("no answer within 10s");
		expect(d(err("EAI_AGAIN"))).toContain("did not resolve");
		expect(d(err("ECONNRESET"))).toContain("cut off");
		expect(d(err("ENETUNREACH"))).toContain("no route");
		expect(d(err("SELF_SIGNED_CERT_IN_CHAIN"))).toContain("NODE_EXTRA_CA_CERTS");
	});
	it("falls back to the code and message, or the message alone", () => {
		expect(d(err("EWHATEVER", "odd"))).toBe("EWHATEVER: odd");
		expect(d(new Error("plain"))).toBe("plain");
		expect(d("just text")).toBe("just text");
		expect(d({ code: "EODD" })).toBe("EODD: ");
	});
});
