import { type ProbeRow, ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import type { ChecklyClient } from "../../rest.js";
import { parseTokenArgs } from "./parse-token-args.js";
import { tokenProbe } from "./token.js";

interface Fakes {
	pages?: Array<{ id: string }> | Error;
	incidents?: unknown[] | Error;
}

const refusal = (status: number) => new ProviderApiError("no", status);

async function check(fakes: Fakes, args?: string[]) {
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const settle = <T>(v: T | Error): Promise<T> =>
		v instanceof Error || typeof v === "string" ? Promise.reject(v) : Promise.resolve(v);
	const client = {
		statusPages: {
			list: () => settle(fakes.pages ?? [{ id: "p1" }]),
			incidents: { list: () => settle(fakes.incidents ?? []) },
		},
	} as unknown as ChecklyClient;
	const probe = tokenProbe({ token: () => "ck-secret", client: () => client });
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

const row = (rows: ProbeRow[], label: string) => rows.find((r) => r.label === label);

describe("checkly token probe", () => {
	it("only reads, accepts another token and never prints the key", async () => {
		const { probe, secrets, rows } = await check({});
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["ck-secret"]);
		expect(JSON.stringify(rows)).not.toContain("ck-secret");
	});

	it("is ok when status pages and incidents read, and says the role cannot be checked", async () => {
		const { rows } = await check({ incidents: [{}, {}] });
		expect(row(rows, "status pages")).toMatchObject({ status: "ok", detail: "read 1" });
		expect(row(rows, "incidents")).toMatchObject({ status: "ok" });
		expect(row(rows, "permissions")?.status).toBe("info");
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	it("reads no incidents when the account has no status page", async () => {
		const { rows } = await check({ pages: [] });
		expect(row(rows, "status pages")?.detail).toBe("read 0");
		expect(row(rows, "incidents")).toBeUndefined();
	});

	it("fails naming a refusal on the status pages and reads no incidents", async () => {
		const { rows } = await check({ pages: refusal(403) });
		expect(row(rows, "status pages")).toMatchObject({ status: "fail" });
		expect(row(rows, "status pages")?.detail).toMatch(/refused \(403\)/);
		expect(row(rows, "incidents")).toBeUndefined();
	});

	it("fails on a refused incidents read and on any other error", async () => {
		const refused = await check({ incidents: refusal(401) });
		expect(row(refused.rows, "incidents")?.detail).toMatch(/refused \(401\)/);
		const other = await check({ incidents: new Error("boom") });
		expect(row(other.rows, "incidents")).toMatchObject({ status: "fail", detail: "boom" });
	});

	it("reports a thrown value that is not an Error by its text", async () => {
		const { rows } = await check({ pages: "bad" as unknown as Error });
		expect(row(rows, "status pages")).toMatchObject({ status: "fail", detail: "bad" });
	});

	it("says whether a layer is one that should hold the key", async () => {
		const ci = await check({}, ["--layer", "ci", "--token-name", "HOLOCRON_CHECKLY_TOKEN"]);
		expect(row(ci.rows, "ci")?.status).toBe("ok");
		const dev = await check({}, ["--layer=dev"]);
		expect(row(dev.rows, "dev")?.status).toBe("info");
	});
});

describe("parseTokenArgs", () => {
	it("reads both spellings", () => {
		expect(parseTokenArgs(["--layer", "ci", "--token-name=X"])).toEqual({ layer: "ci", tokenName: "X" });
		expect(parseTokenArgs(["--layer=ci", "--token-name", "X"])).toEqual({ layer: "ci", tokenName: "X" });
		expect(parseTokenArgs([])).toEqual({});
	});
});
