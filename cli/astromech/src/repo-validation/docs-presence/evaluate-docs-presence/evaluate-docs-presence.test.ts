import { describe, expect, it } from "vitest";

import { evaluateDocsPresence } from "./evaluate-docs-presence.js";

describe("evaluateDocsPresence", () => {
	const base = {
		packages: ["utils/array-utils", "clients/axiom-client"],
		changedFiles: ["utils/array-utils/src/a.ts", "clients/axiom-client/src/b.ts"],
		addedCommentLines: () => [] as string[],
	};

	it("warns for each package without a docs signal", () => {
		expect(evaluateDocsPresence({ ...base, skip: null })).toEqual({
			warn: ["utils/array-utils", "clients/axiom-client"],
			skipped: [],
			missingReason: false,
		});
	});

	it("leaves out a package that has a docs signal", () => {
		const result = evaluateDocsPresence({
			...base,
			changedFiles: [...base.changedFiles, "docs/src/content/docs/clients/axiom.mdx"],
			skip: null,
		});
		expect(result.warn).toEqual(["utils/array-utils"]);
	});

	it("lets a marker with a reason silence every package when it has no scope", () => {
		const result = evaluateDocsPresence({ ...base, skip: { scope: null, reason: "internal only" } });
		expect(result.warn).toEqual([]);
		expect(result.skipped).toEqual([
			{ dir: "utils/array-utils", reason: "internal only" },
			{ dir: "clients/axiom-client", reason: "internal only" },
		]);
	});

	it("limits a scoped marker to the packages it names, by folder, page name or path", () => {
		const byPage = evaluateDocsPresence({ ...base, skip: { scope: ["axiom"], reason: "no page change needed" } });
		expect(byPage.warn).toEqual(["utils/array-utils"]);
		expect(byPage.skipped).toEqual([{ dir: "clients/axiom-client", reason: "no page change needed" }]);
		const byPath = evaluateDocsPresence({ ...base, skip: { scope: ["utils/array-utils"], reason: "r" } });
		expect(byPath.warn).toEqual(["clients/axiom-client"]);
	});

	it("keeps warning, and says so, when the marker has no reason", () => {
		const result = evaluateDocsPresence({ ...base, skip: { scope: null, reason: "" } });
		expect(result.warn).toHaveLength(2);
		expect(result.missingReason).toBe(true);
	});
});
