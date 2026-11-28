import { describe, expect, it } from "vitest";

import { findWorkBranches } from "./find-work-branches.js";

const git = () => "alpha\nfeat/12-do-it\nfix/120-other\nfeat/eng-42-x\nchore/12-b";

describe("findWorkBranches", () => {
	it("keeps the branches of the issue and not one that only starts with its number", () => {
		expect(findWorkBranches(git, "/r", "#12")).toEqual(["feat/12-do-it", "chore/12-b"]);
	});

	it("finds a tracker key and returns nothing for an unusable one", () => {
		expect(findWorkBranches(git, "/r", "ENG-42")).toEqual(["feat/eng-42-x"]);
		expect(findWorkBranches(git, "/r", "nope")).toEqual([]);
	});
});
