import { describe, expect, it } from "vitest";

import { BULK_DOCUMENTS, originFromCommit } from "./origin-from-commit.js";

const specs = (count: number) => Array.from({ length: count }, (_, i) => `.notes/tech-${i}.spec.md`);

describe("originFromCommit", () => {
	it("names the pull request in the subject of a commit that adds a few documents", () => {
		expect(originFromCommit("100\tdocs: add a spec (#1538)", [...specs(BULK_DOCUMENTS), "src/a.ts"])).toEqual({
			time: 100,
			pr: 1538,
		});
	});

	it("names no pull request for a bulk commit, since it is not the document's own", () => {
		expect(originFromCommit("100\tdocs: import the specs (#900)", specs(BULK_DOCUMENTS + 1))).toEqual({
			time: 100,
		});
	});

	it("counts only ADRs and specs, not other files the commit added", () => {
		const others = Array.from({ length: 10 }, (_, i) => `src/f${i}.ts`);

		expect(originFromCommit("100\tfeat: a spec and code (#7)", [".notes/a.spec.md", ...others])).toEqual({
			time: 100,
			pr: 7,
		});
	});

	it("has no pull request when the subject names none", () => {
		expect(originFromCommit("100\tdocs: add a spec", [".notes/a.spec.md"])).toEqual({ time: 100 });
		expect(originFromCommit("100", [])).toEqual({ time: 100 });
	});

	it("is undefined without a commit", () => {
		expect(originFromCommit(undefined, [])).toBeUndefined();
		expect(originFromCommit("", [])).toBeUndefined();
	});
});
