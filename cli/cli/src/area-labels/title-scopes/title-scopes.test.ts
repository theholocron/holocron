import { describe, expect, it } from "vitest";

import { titleScopes } from "./title-scopes.js";

describe("titleScopes", () => {
	it("reads the scope of a conventional title", () => {
		expect(titleScopes("feat(sentinel): add a thing")).toEqual(["sentinel"]);
		expect(titleScopes("  fix(cli)!: break it")).toEqual(["cli"]);
	});

	it("reads each scope of a list", () => {
		expect(titleScopes("fix(cli, docs): both")).toEqual(["cli", "docs"]);
		expect(titleScopes("fix(cli,,): a stray comma")).toEqual(["cli"]);
	});

	it("gives none for no scope, an empty scope or a title that is not conventional", () => {
		expect(titleScopes("feat: add")).toEqual([]);
		expect(titleScopes("feat(): add")).toEqual([]);
		expect(titleScopes("Add the thing (cli)")).toEqual([]);
		expect(titleScopes("")).toEqual([]);
	});
});
