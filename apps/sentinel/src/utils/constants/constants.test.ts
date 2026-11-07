import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sentinelAxiomLogUrl } from "./constants.js";

const env = createEnvLookup({ AXIOM_ORG: "acme-org", SENTINEL_AXIOM_DATASET: "acme-dataset" });

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("sentinelAxiomLogUrl", () => {
	it("builds a query-scoped permalink, not a bare dataset link", () => {
		const url = new URL(sentinelAxiomLogUrl("run-abc", "postCheckRun: posted", env)!);
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/acme-org/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toBe(`['acme-dataset'] | where runId == "run-abc" and msg == "postCheckRun: posted"`);
	});

	it("percent-encodes the initForm value so the URL is safe to embed directly", () => {
		const url = sentinelAxiomLogUrl("run-abc", "postCheckRun: posted", env)!;
		expect(url).not.toContain(" ");
		expect(url).not.toContain('"');
	});

	it("returns undefined, not a wrong link, when AXIOM_ORG is unset", () => {
		expect(
			sentinelAxiomLogUrl("r", "m", createEnvLookup({ SENTINEL_AXIOM_DATASET: "acme-dataset" }))
		).toBeUndefined();
	});

	it("falls back to the bare AXIOM_DATASET when SENTINEL_AXIOM_DATASET is unset", () => {
		expect(
			sentinelAxiomLogUrl("r", "m", createEnvLookup({ AXIOM_ORG: "acme-org", AXIOM_DATASET: "acme-dataset" }))
		).toContain("acme-dataset");
	});

	it("returns undefined, not a wrong link, when SENTINEL_AXIOM_DATASET is unset", () => {
		expect(sentinelAxiomLogUrl("r", "m", createEnvLookup({ AXIOM_ORG: "acme-org" }))).toBeUndefined();
	});

	it("reads the process environment by default", () => {
		vi.stubEnv("AXIOM_ORG", "proc-org");
		vi.stubEnv("SENTINEL_AXIOM_DATASET", "proc-ds");
		expect(sentinelAxiomLogUrl("r", "m")).toContain("https://app.axiom.co/proc-org/query");
	});
});
