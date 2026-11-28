import { describe, expect, it } from "vitest";

import { ConfigError } from "../config-error/index.js";
import { lastWins } from "../last-wins/index.js";
import { union } from "../union/index.js";
import { composeFragments } from "./compose-fragments.js";
import type { ConfigFragment } from "./compose-fragments.type.js";

interface Frag extends ConfigFragment {
	tags?: string[];
	title?: string;
}
interface Out {
	tags: string[];
	title?: string;
}
const strategies = { tags: union<string>(), title: lastWins<string>() };

describe("composeFragments", () => {
	it("starts from each strategy's empty value and omits keys nobody set", () => {
		expect(composeFragments<Frag, Out>(strategies, [])).toEqual({ tags: [] });
	});

	it("flattens arrays, merges per key and lets the last writer win", () => {
		const out = composeFragments<Frag, Out>(strategies, [
			{ id: "a", tags: ["x"], title: "A" },
			[
				{ id: "b", tags: ["x", "y"] },
				{ id: "c", title: "C" },
			],
		]);
		expect(out).toEqual({ tags: ["x", "y"], title: "C" });
	});

	it("dedupes by id, the later fragment replacing the earlier", () => {
		const out = composeFragments<Frag, Out>(strategies, [
			{ id: "a", tags: ["old"] },
			{ id: "a", tags: ["new"] },
		]);
		expect(out.tags).toEqual(["new"]);
	});

	it("reports every unmet requirement in one ConfigError", () => {
		const run = () =>
			composeFragments<Frag, Out>(strategies, [
				{ id: "a", requires: ["x", "y"] },
				{ id: "b", requires: ["a", "z"] },
			]);
		expect(run).toThrow(ConfigError);
		expect(run).toThrow('"a" requires "x", "a" requires "y", "b" requires "z"');
		expect(run).not.toThrow('"b" requires "a"');
	});
});
