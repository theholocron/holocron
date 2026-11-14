import type { ProbeRow } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { cfOk } from "../../helpers.js";
import { createCloudflareClient } from "../../rest.js";
import { tokenProbe } from "./token.js";

const BASE = "https://cf.test/client/v4";
const denied = { status: 403, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } };
const broken = { status: 400, body: { success: false, errors: [{ code: 1, message: "bad request" }] } };
const zone = { id: "z1", name: "example.dev", status: "active" };

async function check(responses: Parameters<typeof stubFetch>[0], over: { accountId?: string; args?: string[] } = {}) {
	const { fetch, calls } = stubFetch(responses);
	const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch, retryDelayMs: 0 });
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({
		options: { accountId: "accountId" in over ? over.accountId : "acct-1" },
		client: () => client,
		token: () => "cf-tok",
		now: () => new Date("2026-11-13T12:00:00Z"),
	});
	await probe.run({
		...(over.args ? { args: over.args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, calls, probe };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets } = await check([cfOk({ id: "t1", status: "active" }), cfOk([])]);
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["cf-tok"]);
	});

	it("reports ok for each permission whose list has items, with the account id it was given", async () => {
		const { rows, calls } = await check([
			cfOk({ id: "t1", status: "active" }),
			cfOk([zone]),
			cfOk([{ id: "r1", name: "example.dev", type: "A", content: "1.1.1.1" }]),
			cfOk([{ id: "w1", pattern: "example.dev/*", script: "s" }]),
			cfOk([{ id: "s1" }]),
			cfOk([{ name: "site" }]),
			cfOk([{ id: "tun", name: "dev" }]),
		]);
		expect(row(rows, "token")).toMatchObject({ status: "ok", detail: "t1 (active)" });
		expect(row(rows, "Zone: Read")).toMatchObject({ status: "ok", detail: "1 zones: example.dev" });
		for (const label of [
			"DNS: Edit (example.dev)",
			"Workers Routes: Edit (example.dev)",
			"Workers Scripts: Edit",
			"Pages: Edit",
			"Cloudflare Tunnel: Edit",
		]) {
			expect(row(rows, label)?.status).toBe("ok");
		}
		expect(calls.some((c) => c.url.includes("/accounts/acct-1/pages/projects"))).toBe(true);
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	describe("rotation", () => {
		const verified = (extra: Record<string, string>) => cfOk({ id: "t1", status: "active", ...extra });
		const rest = [cfOk([]), cfOk([]), cfOk([]), cfOk([])];

		it("reports expiry and the start of validity, and passes a young token far from expiry", async () => {
			const { rows } = await check([
				verified({ expires_on: "2027-06-01T00:00:00Z", not_before: "2026-10-13T00:00:00Z" }),
				...rest,
			]);
			expect(row(rows, "expiry")).toMatchObject({ status: "ok" });
			expect(row(rows, "age")).toMatchObject({ status: "ok" });
		});

		it("fails a token that expires soon and one past the allowed age", async () => {
			const { rows } = await check([
				verified({ expires_on: "2026-11-20T00:00:00Z", not_before: "2026-01-01T00:00:00Z" }),
				...rest,
			]);
			expect(row(rows, "expiry")).toMatchObject({ status: "fail" });
			expect(row(rows, "age")).toMatchObject({ status: "fail" });
		});

		it("says there is no expiry and no creation date when Cloudflare gives neither", async () => {
			const { rows } = await check([verified({}), ...rest]);
			expect(row(rows, "expiry")).toMatchObject({ status: "info", detail: "the token has no expiry" });
			expect(row(rows, "age")?.status).toBe("info");
		});

		it("says it is not exposed for a token verify rejects", async () => {
			const { rows } = await check([denied, ...rest]);
			expect(row(rows, "rotation")).toMatchObject({ status: "info" });
		});

		it("reads the time from the clock when none is injected", async () => {
			const { fetch } = stubFetch([denied, cfOk([])]);
			const client = createCloudflareClient({ token: "cf-tok", baseUrl: BASE, fetch, retryDelayMs: 0 });
			const rows: ProbeRow[] = [];
			await tokenProbe({ options: {}, client: () => client, token: () => "cf-tok" }).run({
				dryRun: false,
				say: (r) => void rows.push(r),
				secret: () => {},
				write: async () => undefined,
				cleanup: () => {},
			});
			expect(row(rows, "rotation")).toBeDefined();
		});
	});

	it("treats a 403 and an empty list as no access, not as a failure", async () => {
		const { rows } = await check([
			denied, // verify: an account-scoped token
			cfOk([]), // no zones visible
			cfOk([]), // scripts
			cfOk([{ name: "site" }]), // pages
			denied, // tunnels
		]);
		// A token the verify endpoint rejects gets no row of its own; what it can reach is the answer.
		expect(row(rows, "token")).toBeUndefined();
		expect(row(rows, "Zone: Read")).toMatchObject({ status: "info" });
		expect(row(rows, "Workers Scripts: Edit")).toMatchObject({ status: "info" });
		expect(row(rows, "Pages: Edit")).toMatchObject({ status: "ok", detail: "1 projects: site" });
		expect(row(rows, "Cloudflare Tunnel: Edit")).toMatchObject({ status: "info", detail: "no access (403)" });
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	it("limits the zone checks to the zones named after the probe", async () => {
		const { calls } = await check([denied, cfOk([zone]), cfOk([]), cfOk([]), cfOk([]), cfOk([]), cfOk([])], {
			args: ["example.dev"],
		});
		expect(calls[1]?.url).toContain("name=example.dev");
	});

	it("shortens a long list of zones and reads DNS and routes for only the first five", async () => {
		const many = Array.from({ length: 7 }, (_, i) => ({ id: `z${i}`, name: `d${i}.dev`, status: "active" }));
		const { rows, calls } = await check([
			denied,
			cfOk(many),
			...Array(10).fill(cfOk([])),
			cfOk([]),
			cfOk([]),
			cfOk([]),
		]);
		expect(row(rows, "Zone: Read")?.detail).toBe("7 zones: d0.dev, d1.dev, d2.dev, d3.dev, d4.dev (+2 more)");
		expect(rows.filter((r) => r.label.startsWith("DNS: Edit"))).toHaveLength(5);
		expect(calls.filter((c) => c.url.includes("/dns_records"))).toHaveLength(5);
	});

	it("counts items that carry no name", async () => {
		const { rows } = await check([denied, cfOk([]), cfOk([]), cfOk([]), cfOk([{ id: "t" }])]);
		expect(row(rows, "Cloudflare Tunnel: Edit")).toMatchObject({ status: "ok", detail: "1 tunnels" });
	});

	it("fails a row for an error that is not about access", async () => {
		const { rows } = await check([denied, cfOk([zone]), broken, cfOk([]), cfOk([]), cfOk([]), cfOk([])]);
		expect(row(rows, "DNS: Edit (example.dev)")?.status).toBe("fail");
	});

	it("fails the zone row and stops when listing zones breaks", async () => {
		const { rows, calls } = await check([denied, broken]);
		expect(row(rows, "Zone: Read")?.status).toBe("fail");
		expect(calls).toHaveLength(2);
	});

	describe("checked against a layer", () => {
		const ci = { args: ["--layer", "ci"] };

		it("passes a ci token that has Pages and nothing else", async () => {
			const { rows, calls } = await check([denied, cfOk([]), cfOk([]), cfOk([{ name: "site" }]), cfOk([])], ci);
			// What is rightly absent is a bare ok; what is present says what it found.
			expect(row(rows, "Zone: Read")).toEqual({ status: "ok", label: "Zone: Read" });
			expect(row(rows, "Workers Scripts: Edit")).toEqual({ status: "ok", label: "Workers Scripts: Edit" });
			expect(row(rows, "Pages: Edit")).toMatchObject({ status: "ok", detail: "1 projects: site" });
			expect(row(rows, "Cloudflare Tunnel: Edit")?.status).toBe("ok");
			expect(rows.some((r) => r.status === "fail")).toBe(false);
			// "ci" is the layer, not a zone to look up.
			expect(calls[1]?.url).not.toContain("name=ci");
		});

		it("fails a ci token that can reach a permission it must not have", async () => {
			const { rows } = await check(
				[denied, cfOk([]), cfOk([{ id: "s1" }]), cfOk([{ name: "site" }]), cfOk([{ id: "t", name: "dev" }])],
				ci
			);
			expect(row(rows, "Workers Scripts: Edit")).toMatchObject({ status: "fail", detail: "1 scripts: s1" });
			expect(row(rows, "Cloudflare Tunnel: Edit")?.status).toBe("fail");
			expect(row(rows, "Pages: Edit")?.status).toBe("ok");
		});

		it("fails a ci token that cannot reach Pages", async () => {
			const { rows } = await check([denied, cfOk([]), cfOk([]), denied, cfOk([])], ci);
			expect(row(rows, "Pages: Edit")).toMatchObject({ status: "fail", detail: "no access (403)" });
		});

		it("shows what the layer needs first and what it must not have after, each under its own heading", async () => {
			const { rows } = await check([denied, cfOk([]), cfOk([]), cfOk([{ name: "site" }]), cfOk([])], ci);
			expect(rows.map((r) => `${r.status}:${r.label}`)).toEqual([
				"heading:Should have",
				"ok:Pages: Edit",
				"heading:Should not have",
				"ok:Zone: Read",
				"ok:Workers Scripts: Edit",
				"ok:Cloudflare Tunnel: Edit",
				"heading:Rotation",
				"info:rotation",
			]);
		});

		it("says nothing before the results about where the token came from or what it is checked against", async () => {
			const { rows } = await check([denied, cfOk([]), cfOk([]), cfOk([{ name: "site" }]), cfOk([])], ci);
			// The only info row is the rotation one, after its own heading.
			const rotation = rows.findIndex((r) => r.label === "Rotation");
			expect(rows.slice(0, rotation).filter((r) => r.status === "info")).toEqual([]);
			expect(rows[0]).toMatchObject({ status: "heading" });
		});

		it("fails a dev token that lacks any of the six, and passes one that has them", async () => {
			const dev = { args: ["--layer", "dev"] };
			const missing = await check(
				[
					denied,
					cfOk([zone]),
					cfOk([{ id: "r", name: "a", type: "A", content: "1" }]),
					denied,
					cfOk([]),
					cfOk([{ name: "site" }]),
					cfOk([{ id: "t", name: "d" }]),
				],
				dev
			);
			expect(row(missing.rows, "Workers Routes: Edit (example.dev)")?.status).toBe("fail");
			expect(row(missing.rows, "Workers Scripts: Edit")?.status).toBe("fail");
			const full = await check(
				[
					denied,
					cfOk([zone]),
					cfOk([{ id: "r", name: "a", type: "A", content: "1" }]),
					cfOk([{ id: "w", pattern: "example.dev/*", script: "s" }]),
					cfOk([{ id: "s1" }]),
					cfOk([{ name: "site" }]),
					cfOk([{ id: "t", name: "d" }]),
				],
				dev
			);
			expect(full.rows.some((r) => r.status === "fail")).toBe(false);
		});

		it("only describes a layer with no declared expectations, and says so", async () => {
			const { rows } = await check([denied, cfOk([]), cfOk([]), cfOk([]), cfOk([])], {
				args: ["--layer", "prod"],
			});
			expect(row(rows, "prod")?.detail).toContain("no expectations");
			expect(rows.some((r) => r.status === "fail")).toBe(false);
		});

		it("judges the token named by --token-name, and describes one the layer does not declare", async () => {
			const own = { args: ["--layer", "ci", "--token-name", "HOLOCRON_CLOUDFLARE_TOKEN"] };
			const judged = await check([denied, cfOk([]), cfOk([]), cfOk([{ name: "site" }]), cfOk([])], own);
			expect(row(judged.rows, "Should have")).toMatchObject({ status: "heading" });
			const other = { args: ["--layer", "ci", "--token-name", "HOLOCRON_OTHER_TOKEN"] };
			const { rows } = await check([denied, cfOk([]), cfOk([]), cfOk([]), cfOk([])], other);
			expect(row(rows, "ci")?.detail).toContain("no expectations");
		});

		it("fails a layer check that cannot reach the account permissions for want of an account id", async () => {
			const { rows } = await check([denied, cfOk([])], { ...ci, accountId: undefined });
			expect(row(rows, "account permissions")?.status).toBe("fail");
		});
	});

	it("says the account permissions were not checked when there is no account id", async () => {
		const { rows, calls } = await check([denied, cfOk([])], { accountId: undefined });
		expect(row(rows, "account permissions")?.status).toBe("info");
		expect(calls).toHaveLength(2);
	});
});
