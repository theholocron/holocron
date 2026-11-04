import { describe, expect, it } from "vitest";

import { describeLogging } from "./dev-logging.js";

describe("describeLogging", () => {
	it("names the dataset, and never the token, when both are set", () => {
		const line = describeLogging({
			SENTINEL_AXIOM_INGEST_TOKEN: "xaat-SECRET",
			AXIOM_DATASET: "holocron-sentinel-dev",
		});
		expect(line).toBe('logs: shipped to Axiom, dataset "holocron-sentinel-dev"');
		expect(line).not.toContain("SECRET");
	});

	it("says logs are not shipped when either is missing or empty", () => {
		const none = "logs: not shipped to Axiom (SENTINEL_AXIOM_INGEST_TOKEN and AXIOM_DATASET are not both set)";
		expect(describeLogging({})).toBe(none);
		expect(describeLogging({ SENTINEL_AXIOM_INGEST_TOKEN: "t" })).toBe(none);
		expect(describeLogging({ SENTINEL_AXIOM_INGEST_TOKEN: "t", AXIOM_DATASET: "" })).toBe(none);
	});
});
