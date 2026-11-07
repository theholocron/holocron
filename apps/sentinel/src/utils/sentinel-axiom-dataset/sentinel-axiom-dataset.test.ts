import { describe, expect, it } from "vitest";

import { sentinelAxiomDataset } from "./sentinel-axiom-dataset.js";

const env = (vars: Record<string, string>) => ({ get: (name: string) => vars[name] });

describe("sentinelAxiomDataset", () => {
	it("takes SENTINEL_AXIOM_DATASET first", () => {
		expect(sentinelAxiomDataset(env({ SENTINEL_AXIOM_DATASET: "holocron-sentinel", AXIOM_DATASET: "old" }))).toBe(
			"holocron-sentinel"
		);
	});

	it("falls back to the bare AXIOM_DATASET", () => {
		expect(sentinelAxiomDataset(env({ AXIOM_DATASET: "holocron-sentinel" }))).toBe("holocron-sentinel");
	});

	it("is undefined when neither is set", () => {
		expect(sentinelAxiomDataset(env({}))).toBeUndefined();
	});
});
