import { describe, expect, it } from "vitest";

import { sentinelAxiomLogUrl } from "./constants.js";

describe("sentinelAxiomLogUrl", () => {
	it("builds a query-scoped permalink, not a bare dataset link", () => {
		const url = new URL(sentinelAxiomLogUrl("run-abc", "postCheckRun: posted"));
		expect(url.origin + url.pathname).toBe("https://app.axiom.co/the-holocron-7bbe/query");
		const apl = (JSON.parse(url.searchParams.get("initForm")!) as { apl: string }).apl;
		expect(apl).toBe(`['holocron-sentinel'] | where runId == "run-abc" and msg == "postCheckRun: posted"`);
	});

	it("percent-encodes the initForm value so the URL is safe to embed directly", () => {
		const url = sentinelAxiomLogUrl("run-abc", "postCheckRun: posted");
		expect(url).not.toContain(" ");
		expect(url).not.toContain('"');
	});
});
