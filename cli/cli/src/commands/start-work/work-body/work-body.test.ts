import { describe, expect, it } from "vitest";

import { buildWorkBody } from "./work-body.js";

describe("buildWorkBody", () => {
	it("links the issue and the spec and lists the four definition-of-done items", () => {
		const body = buildWorkBody({
			issue: "#12",
			issueTitle: "Do it",
			issueUrl: "https://x/12",
			spec: ".notes/a.spec.md",
		});
		expect(body).toContain("Issue: [#12](https://x/12) Do it");
		expect(body).toContain("Spec: `.notes/a.spec.md`");
		for (const item of ["Code", "Tests", "Docs", "Green checks"]) expect(body).toContain(`- [ ] ${item}`);
		expect(body).not.toMatch(/Closes|Refs/);
	});

	it("says the issue is the spec when there is none, and names a bare key without a link", () => {
		const body = buildWorkBody({ issue: "ENG-1", issueTitle: "T" });
		expect(body).toContain("Issue: ENG-1 T");
		expect(body).toContain("Spec: none");
	});
});
