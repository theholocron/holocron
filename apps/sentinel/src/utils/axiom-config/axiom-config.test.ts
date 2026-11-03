import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAxiomConfig } from "./axiom-config.js";

function env(vars: Record<string, string | undefined>) {
	return { get: (name: string) => vars[name] };
}

describe("resolveAxiomConfig — SENTINEL_AXIOM_INGEST_TOKEN / AXIOM_DATASET", () => {
	it("passes an explicit axiom config through when both env vars are set", () => {
		expect(
			resolveAxiomConfig(env({ SENTINEL_AXIOM_INGEST_TOKEN: "tok_abc", AXIOM_DATASET: "holocron-sentinel" }))
		).toEqual({
			axiom: { token: "tok_abc", dataset: "holocron-sentinel" },
		});
	});

	it("omits axiom config when the dataset is unset", () => {
		expect(resolveAxiomConfig(env({ SENTINEL_AXIOM_INGEST_TOKEN: "tok_abc" }))).toEqual({});
	});

	it("omits axiom config when the token is unset", () => {
		expect(resolveAxiomConfig(env({ AXIOM_DATASET: "holocron-sentinel" }))).toEqual({});
	});

	it("omits axiom config when neither is set", () => {
		expect(resolveAxiomConfig(env({}))).toEqual({});
	});

	it("treats an empty value as unset", () => {
		expect(
			resolveAxiomConfig(env({ SENTINEL_AXIOM_INGEST_TOKEN: "", AXIOM_DATASET: "holocron-sentinel" }))
		).toEqual({});
		expect(resolveAxiomConfig(env({ SENTINEL_AXIOM_INGEST_TOKEN: "tok_abc", AXIOM_DATASET: "" }))).toEqual({});
	});

	it("ignores the broader AXIOM_TOKEN that createLogger() would auto-detect (holocron#780/#781)", () => {
		expect(resolveAxiomConfig(env({ AXIOM_TOKEN: "broad", AXIOM_DATASET: "holocron-sentinel" }))).toEqual({});
	});
});

describe("a .env in the working directory", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("is not read: the lookup Sentinel builds sees only process.env (#1640)", async () => {
		const dir = mkdtempSync(join(tmpdir(), "sentinel-env-"));
		try {
			writeFileSync(join(dir, ".env"), "SENTINEL_AXIOM_INGEST_TOKEN=tok\nAXIOM_DATASET=ds\n");
			vi.spyOn(process, "cwd").mockReturnValue(dir);
			vi.resetModules();
			const { createEnvLookup } = await import("@theholocron/env-utils");

			expect(resolveAxiomConfig(createEnvLookup({}))).toEqual({});
			expect(resolveAxiomConfig(createEnvLookup())).toEqual({});
			expect(process.env["SENTINEL_AXIOM_INGEST_TOKEN"]).toBeUndefined();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
