import { describe, expect, it } from "vitest";

import { describeLogging } from "./dev-logging.js";

const vars = { tokenVar: "SENTINEL_AXIOM_INGEST_TOKEN", datasetVar: "AXIOM_DATASET" };

describe("describeLogging", () => {
	it("names the dataset, and never the token, when both are set", () => {
		const line = describeLogging(
			{ SENTINEL_AXIOM_INGEST_TOKEN: "xaat-SECRET", AXIOM_DATASET: "holocron-sentinel-dev" },
			vars
		);
		expect(line).toBe('logs: shipped to Axiom, dataset "holocron-sentinel-dev"');
		expect(line).not.toContain("SECRET");
	});

	it("says logs are not shipped when either is missing or empty, naming the variables it read", () => {
		const none = "logs: not shipped to Axiom (SENTINEL_AXIOM_INGEST_TOKEN and AXIOM_DATASET are not both set)";
		expect(describeLogging({}, vars)).toBe(none);
		expect(describeLogging({ SENTINEL_AXIOM_INGEST_TOKEN: "t" }, vars)).toBe(none);
		expect(describeLogging({ SENTINEL_AXIOM_INGEST_TOKEN: "t", AXIOM_DATASET: "" }, vars)).toBe(none);
	});

	it("reads whichever variables it is told to", () => {
		const line = describeLogging({ T: "t", D: "ds" }, { tokenVar: "T", datasetVar: "D" });
		expect(line).toBe('logs: shipped to Axiom, dataset "ds"');
	});
});
