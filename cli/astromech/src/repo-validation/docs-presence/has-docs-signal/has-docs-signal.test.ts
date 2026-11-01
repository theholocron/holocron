import { describe, expect, it } from "vitest";

import { hasDocsSignal } from "./has-docs-signal.js";

describe("hasDocsSignal", () => {
	it("counts a changed README, a docs page named after the package, or a doc comment", () => {
		expect(hasDocsSignal("utils/array-utils", ["utils/array-utils/README.md"], [])).toBe(true);
		expect(hasDocsSignal("utils/array-utils", ["docs/src/content/docs/utils/array-utils.mdx"], [])).toBe(true);
		expect(hasDocsSignal("clients/axiom-client", ["docs/src/content/docs/clients/axiom.mdx"], [])).toBe(true);
		expect(hasDocsSignal("utils/array-utils", [], ["+/** x */"])).toBe(true);
	});

	it("does not count an unrelated docs file or README, or a docs file that is not markdown", () => {
		expect(hasDocsSignal("utils/array-utils", ["docs/src/content/docs/utils/fs-utils.mdx"], [])).toBe(false);
		expect(hasDocsSignal("utils/array-utils", ["utils/other/README.md", "package.json"], [])).toBe(false);
		expect(hasDocsSignal("utils/array-utils", ["docs/array-utils.png"], [])).toBe(false);
	});
});
