import type { ProbeRow } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createVercelClient } from "../../rest.js";
import { parseLayer } from "./parse-layer.js";
import { tokenProbe } from "./token.js";

type Response = Parameters<typeof stubFetch>[0][number];

async function check(
	projects: Response,
	over: { args?: string[]; who?: { ok: true; subject: string } | { ok: false; message: string } } = {}
) {
	const { fetch } = stubFetch([projects]);
	const client = createVercelClient({ token: "v-tok", fetch });
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const probe = tokenProbe({
		client: () => client,
		token: () => "v-tok",
		verify: async () => over.who ?? { ok: true, subject: "user @ a@b.dev" },
	});
	await probe.run({
		...(over.args ? { args: over.args } : {}),
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: (v) => void secrets.push(v),
		write: async () => undefined,
		cleanup: () => {},
	});
	return { rows, secrets, probe };
}

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets, rows } = await check({ status: 200, body: { projects: [] } });
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["v-tok"]);
		expect(JSON.stringify(rows)).not.toContain("v-tok");
	});

	it("reports the user and the projects the token can list, and that scope is not checked", async () => {
		const { rows } = await check({ status: 200, body: { projects: [{ id: "p", name: "n" }] } });
		expect(row(rows, "token")).toEqual({ status: "ok", label: "token", detail: "user @ a@b.dev" });
		expect(row(rows, "Projects: Read")).toMatchObject({ status: "ok", detail: "1 projects" });
		expect(row(rows, "permissions")).toMatchObject({ status: "info" });
	});

	it("fails the token row and stops when the user cannot be read", async () => {
		const { rows } = await check(
			{ status: 200, body: { projects: [] } },
			{ who: { ok: false, message: "401 bad token" } }
		);
		expect(rows).toEqual([{ status: "fail", label: "token", detail: "401 bad token" }]);
	});

	it("treats a 403 on projects as no access, not a failure", async () => {
		const { rows } = await check({ status: 403, body: { error: { code: "forbidden" } } });
		expect(row(rows, "Projects: Read")).toMatchObject({ status: "info", detail: "no access (403)" });
	});

	it("fails the projects row for an error that is not about access", async () => {
		const { rows } = await check({ status: 500, body: { error: { code: "boom" } } });
		expect(row(rows, "Projects: Read")?.status).toBe("fail");
	});

	it("accepts a layer that holds the token and only describes one that does not", async () => {
		const ok = await check({ status: 200, body: { projects: [] } }, { args: ["--layer", "ci"] });
		expect(row(ok.rows, "ci")).toMatchObject({ status: "ok" });
		const other = await check({ status: 200, body: { projects: [] } }, { args: ["--layer=prod"] });
		expect(row(other.rows, "prod")).toMatchObject({ status: "info" });
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
