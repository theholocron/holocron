import type { ProbeRow } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { TurboCache } from "../../capabilities/cache.js";
import { createTurboClient } from "../../rest.js";
import { parseLayer } from "./parse-layer.js";
import { tokenProbe } from "./token.js";

type Response = Parameters<typeof stubFetch>[0][number];

async function check(response: Response, over: { args?: string[]; team?: string | null; throws?: boolean } = {}) {
	const { fetch, calls } = stubFetch([response]);
	const client = createTurboClient({ token: "v-tok", fetch });
	const team = over.team === null ? undefined : (over.team ?? "acme");
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({
		cache: () =>
			over.throws
				? ({
						key: "cache",
						providerName: "turbo",
						checkToken: async () => {
							throw new Error("network down");
						},
					} as never)
				: new TurboCache(
						() => client,
						() => team
					),
		team: () => team,
		token: () => "v-tok",
	});
	await probe.run({
		...(over.args ? { args: over.args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, probe, calls };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets, rows } = await check({ body: { status: "enabled" } });
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["v-tok"]);
		expect(JSON.stringify(rows)).not.toContain("v-tok");
	});

	it("reports the token, team and cache for an enabled cache, and that scope is not checked", async () => {
		const { rows } = await check({ body: { status: "enabled" } });
		expect(row(rows, "team")).toMatchObject({ status: "ok", detail: "acme" });
		expect(row(rows, "token")).toMatchObject({ status: "ok" });
		expect(row(rows, "team access")).toMatchObject({ status: "ok" });
		expect(row(rows, "remote cache")).toMatchObject({ status: "ok", detail: "enabled" });
		expect(row(rows, "permissions")).toMatchObject({ status: "info" });
	});

	it("fails the team row, naming the variable, when no team is set", async () => {
		const { rows, calls } = await check({ body: {} }, { team: null });
		expect(rows).toEqual([expect.objectContaining({ status: "fail", label: "team" })]);
		expect(row(rows, "team")?.detail).toContain("HOLOCRON_TURBO_TEAM");
		expect(calls).toHaveLength(0);
	});

	it("fails the token row and stops for a 401", async () => {
		const { rows } = await check({ status: 401, body: {} });
		expect(row(rows, "token")).toMatchObject({ status: "fail" });
		expect(row(rows, "team access")).toBeUndefined();
	});

	it("fails the team access row for a 403", async () => {
		const { rows } = await check({ status: 403, body: {} });
		expect(row(rows, "token")).toMatchObject({ status: "ok" });
		expect(row(rows, "team access")).toMatchObject({ status: "fail" });
	});

	it("fails the cache row when Remote Caching is off, and for a 402", async () => {
		expect(row((await check({ body: { status: "over_limit" } })).rows, "remote cache")).toMatchObject({
			status: "fail",
		});
		expect(row((await check({ status: 402, body: {} })).rows, "remote cache")).toMatchObject({ status: "fail" });
	});

	it("describes a state it does not know instead of failing", async () => {
		const { rows } = await check({ body: { status: "sleeping" } });
		expect(row(rows, "remote cache")).toMatchObject({ status: "info" });
		expect(row(rows, "remote cache")?.detail).toContain("sleeping");
	});

	it("notes a read-only token as info", async () => {
		const { rows } = await check({ body: { status: "enabled", readOnly: true } });
		expect(row(rows, "upload")).toMatchObject({ status: "info" });
	});

	it("fails the cache row when the request itself fails", async () => {
		const { rows } = await check({ body: {} }, { throws: true });
		expect(row(rows, "remote cache")).toMatchObject({ status: "fail", detail: "network down" });
	});

	it("accepts the ci layer and only describes any other", async () => {
		const ci = await check({ body: { status: "enabled" } }, { args: ["--layer", "ci"] });
		expect(row(ci.rows, "ci")).toMatchObject({ status: "ok" });
		const dev = await check({ body: { status: "enabled" } }, { args: ["--layer=dev"] });
		expect(row(dev.rows, "dev")).toMatchObject({ status: "info" });
	});
});

describe("parseLayer", () => {
	it("reads the layer in either spelling, and none when it is not given", () => {
		expect(parseLayer([])).toBeUndefined();
		expect(parseLayer(["x", "--layer", "ci"])).toBe("ci");
		expect(parseLayer(["--layer=dev"])).toBe("dev");
		expect(parseLayer(["--layer"])).toBeUndefined();
	});
});
