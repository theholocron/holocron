import { describe, expect, it } from "vitest";

import type { OptionPrompt } from "../../prompts/index.js";
import { optionArgv } from "./option-argv.js";

const option = (extra: Partial<OptionPrompt> = {}): OptionPrompt => ({
	key: "x",
	flag: "--x",
	type: "input",
	message: "",
	...extra,
});

describe("optionArgv", () => {
	it("renders nothing for an unanswered option", () => {
		expect(optionArgv(option(), undefined)).toEqual([]);
	});

	it("renders booleans, honouring negatable", () => {
		expect(optionArgv(option(), true)).toEqual(["--x"]);
		expect(optionArgv(option(), false)).toEqual([]);
		expect(optionArgv(option({ negatable: true }), false)).toEqual(["--no-x"]);
	});

	it("renders arrays and strings, omitting empty ones", () => {
		expect(optionArgv(option(), ["a", "b"])).toEqual(["--x", "a", "b"]);
		expect(optionArgv(option(), [])).toEqual([]);
		expect(optionArgv(option(), "v")).toEqual(["--x", "v"]);
		expect(optionArgv(option(), "")).toEqual([]);
	});
});
