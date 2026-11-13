import type { ProbeRow } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createAxiomClient } from "../../rest.js";
import { tokenProbe } from "./token.js";

const ok = (body: unknown = {}) => ({ body });
const denied = { status: 403, body: { message: "forbidden" } };
const missing = { status: 404, body: { message: "not found" } };
const broken = { status: 500, body: { message: "boom" } };
const ds = (name: string) => ({ id: name, name });

/** Responses are taken in order: for each dataset read, ingest, query; then the list of datasets. */
async function check(
	responses: Parameters<typeof stubFetch>[0],
	over: { dataset?: string | null; args?: string[] } = {}
) {
	const { fetch, calls } = stubFetch(responses);
	const client = createAxiomClient({ token: "xaat-tok", baseUrl: "https://axiom.test", fetch });
	const rows: ProbeRow[] = [];
	const secrets: Array<string | undefined> = [];
	const dataset = over.dataset === null ? undefined : (over.dataset ?? "holocron");
	const probe = tokenProbe({
		options: dataset ? { dataset } : {},
		client: () => client,
		token: () => "xaat-tok",
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
const shape = (rows: ProbeRow[]) => rows.map((r) => `${r.status}:${r.label}`);

describe("token probe", () => {
	it("only reads, accepts another token, and never prints the token", async () => {
		const { probe, secrets } = await check([ok(ds("holocron")), ok(), ok(), ok([])]);
		expect(probe.writes).toBe(false);
		expect(probe.acceptsToken).toBe(true);
		expect(secrets).toEqual(["xaat-tok"]);
	});

	it("tries read, ingest (an empty list, so no event) and query on the plugin's dataset", async () => {
		const { calls } = await check([ok(ds("holocron")), ok(), ok(), ok([])]);
		expect(calls[0]?.url).toContain("/v2/datasets/holocron");
		expect(calls[1]?.url).toContain("/v1/datasets/holocron/ingest");
		expect(calls[1]?.body).toEqual([]);
		expect(calls[2]?.url).toContain("/v1/datasets/_apl");
		expect(calls[2]?.body).toMatchObject({ apl: "['holocron'] | take 1" });
		expect(calls[3]?.url).toMatch(/\/v2\/datasets$/);
	});

	it("quotes a dataset name the way APL quotes an identifier", async () => {
		const { calls } = await check([ok(), ok(), ok(), ok([])], { dataset: "a'b\\c" });
		expect(calls[2]?.body).toMatchObject({ apl: "['a\\'b\\\\c'] | take 1" });
	});

	it("describes a token with no layer: ok for access, info for none", async () => {
		const { rows } = await check([ok(ds("holocron")), denied, missing, ok([ds("holocron"), ds("other")])]);
		expect(row(rows, "Read (holocron)")?.status).toBe("ok");
		expect(row(rows, "Ingest (holocron)")).toMatchObject({ status: "info", detail: "no access (403)" });
		expect(row(rows, "Query (holocron)")).toMatchObject({
			status: "info",
			detail: "no such dataset, or the token cannot see it (404)",
		});
		expect(row(rows, "datasets")).toMatchObject({ status: "info", detail: "2: holocron, other" });
		expect(rows.some((r) => r.status === "fail")).toBe(false);
	});

	it("uses the dataset names after the probe instead of the plugin's", async () => {
		const { calls, rows } = await check([ok(), ok(), ok(), ok(), ok(), ok(), ok([])], { args: ["one", "two"] });
		expect(calls[0]?.url).toContain("/v2/datasets/one");
		expect(calls[3]?.url).toContain("/v2/datasets/two");
		expect(row(rows, "Read (two)")?.status).toBe("ok");
	});

	it("fails a row for an error that is not about access", async () => {
		const { rows } = await check([broken, ok(), ok(), ok([])]);
		expect(row(rows, "Read (holocron)")?.status).toBe("fail");
	});

	it("says what is missing when there is no dataset: info when only describing, fail under a layer", async () => {
		const plain = await check([ok([])], { dataset: null });
		expect(row(plain.rows, "dataset")?.status).toBe("info");
		const judged = await check([ok([])], { dataset: null, args: ["--layer", "dev"] });
		expect(row(judged.rows, "dataset")?.status).toBe("fail");
	});

	describe("the datasets the token can see", () => {
		it("says none are visible", async () => {
			const { rows } = await check([ok(), ok(), ok(), ok([])]);
			expect(row(rows, "datasets")).toMatchObject({ status: "info", detail: "none visible" });
		});

		it("shortens a long list", async () => {
			const many = Array.from({ length: 10 }, (_, i) => ds(`d${i}`));
			const { rows } = await check([ok(), ok(), ok(), ok(many)]);
			expect(row(rows, "datasets")?.detail).toBe("10: d0, d1, d2, d3, d4, d5, d6, d7 (+2 more)");
		});

		it("points out a retired dataset the token still reaches", async () => {
			const { rows } = await check([ok(), ok(), ok(), ok([ds("holocron"), ds("holocron-local")])]);
			expect(row(rows, "holocron-local")).toMatchObject({ status: "info" });
			expect(row(rows, "holocron-local")?.detail).toContain("retired");
			expect(row(rows, "holocron")).toBeUndefined();
		});

		it("is only info when the token cannot list datasets", async () => {
			const { rows } = await check([ok(), ok(), ok(), denied]);
			expect(row(rows, "datasets")).toMatchObject({
				status: "info",
				detail: "the token cannot list datasets (403)",
			});
		});

		it("fails when listing breaks for another reason", async () => {
			const { rows } = await check([ok(), ok(), ok(), broken]);
			expect(row(rows, "datasets")?.status).toBe("fail");
		});
	});

	describe("checked against a layer", () => {
		const ci = { args: ["--layer", "ci"] };
		const dev = { args: ["--layer", "dev"] };

		it("passes a ci token that reads and ingests but cannot query", async () => {
			const { rows, calls } = await check([ok(ds("holocron")), ok(), denied, ok([ds("holocron")])], ci);
			expect(row(rows, "Query (holocron)")).toEqual({ status: "ok", label: "Query (holocron)" });
			expect(row(rows, "Ingest (holocron)")?.status).toBe("ok");
			expect(rows.some((r) => r.status === "fail")).toBe(false);
			// "ci" is the layer, not a dataset.
			expect(calls[0]?.url).not.toContain("/ci");
		});

		it("fails a ci token that can query, and one that cannot ingest", async () => {
			const { rows } = await check([ok(), denied, ok(), ok([])], ci);
			expect(row(rows, "Query (holocron)")).toMatchObject({ status: "fail" });
			expect(row(rows, "Ingest (holocron)")).toMatchObject({ status: "fail", detail: "no access (403)" });
		});

		it("fails an absent permission that errors for another reason", async () => {
			const { rows } = await check([ok(), ok(), broken, ok([])], ci);
			expect(row(rows, "Query (holocron)")?.status).toBe("fail");
		});

		it("shows what the layer needs first and what it must not have after, each under its own heading", async () => {
			const { rows } = await check([ok(ds("holocron")), ok(), denied, ok([ds("holocron")])], ci);
			expect(shape(rows)).toEqual([
				"heading:Should have",
				"ok:Read (holocron)",
				"ok:Ingest (holocron)",
				"heading:Should not have",
				"ok:Query (holocron)",
				"heading:Datasets this token can see",
				"info:datasets",
			]);
		});

		it("fails a dev token that lacks any of the three, and passes one that has them", async () => {
			const lacking = await check([ok(), ok(), denied, ok([])], dev);
			expect(row(lacking.rows, "Query (holocron)")?.status).toBe("fail");
			const full = await check([ok(), ok(), ok(), ok([])], dev);
			expect(full.rows.some((r) => r.status === "fail")).toBe(false);
			expect(full.rows.some((r) => r.label === "Should not have")).toBe(false);
		});

		it("only describes a layer with no declared expectations, and says so", async () => {
			const { rows } = await check([ok(), denied, ok(), ok([])], { args: ["--layer", "prod"] });
			expect(row(rows, "prod")).toMatchObject({ status: "info" });
			expect(row(rows, "Ingest (holocron)")?.status).toBe("info");
		});
	});
});
