import type { ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { parseLayer } from "./parse-layer.js";
import { tokenProbe } from "./token.js";

async function check(args?: string[]) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({ token: () => "fern-tok" });
	await probe.run({
		...(args ? { args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, probe };
}

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets, rows } = await check();
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["fern-tok"]);
		expect(JSON.stringify(rows)).not.toContain("fern-tok");
	});

	it("says a token is set and that its permissions are not checked", async () => {
		const { rows } = await check();
		expect(rows).toEqual([
			{ status: "ok", label: "token", detail: "set" },
			{
				status: "info",
				label: "permissions",
				detail: "Fern cannot report a token's permissions, so they are not checked",
			},
		]);
	});

	it("accepts the layer that holds the token", async () => {
		const { rows } = await check(["--layer", "ci"]);
		expect(rows[1]).toMatchObject({ status: "ok", label: "ci" });
	});

	it("only describes a layer the token is not declared for", async () => {
		const { rows } = await check(["--layer=dev"]);
		expect(rows[1]).toMatchObject({ status: "info", label: "dev" });
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
