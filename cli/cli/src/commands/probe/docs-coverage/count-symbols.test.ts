import { describe, expect, it } from "vitest";

import { countSymbols } from "./count-symbols.js";

const doc = { summary: [{ kind: "text", text: "docs" }] };

describe("countSymbols", () => {
	it("counts the kinds that should be documented and whether each has a comment", () => {
		const symbols = countSymbols(
			[
				{ name: "a", kind: 64, signatures: [{ comment: doc, sources: [{ fileName: "src/a.ts", line: 3 }] }] },
				{ name: "b", kind: 64, signatures: [{ sources: [{ fileName: "src/a.ts", line: 9 }] }] },
				{
					name: "T",
					kind: 2097152,
					comment: { blockTags: [{}] },
					sources: [{ fileName: "src/t.ts", line: 1 }],
				},
				{ name: "ignored", kind: 4 },
			],
			"pkg/src/index.ts"
		);
		expect(symbols).toEqual([
			{ kind: "Function", name: "a", file: "src/a.ts", line: 3, documented: true },
			{ kind: "Function", name: "b", file: "src/a.ts", line: 9, documented: false },
			{ kind: "TypeAlias", name: "T", file: "src/t.ts", line: 1, documented: true },
		]);
	});

	it("walks into members and into an inline type literal's properties", () => {
		const symbols = countSymbols(
			[
				{
					name: "Options",
					kind: 256,
					comment: doc,
					sources: [{ fileName: "src/o.ts", line: 1 }],
					children: [{ name: "retries", kind: 1024, sources: [{ fileName: "src/o.ts", line: 2 }] }],
				},
				{
					name: "make",
					kind: 32,
					sources: [{ fileName: "src/m.ts", line: 4 }],
					type: { declaration: { children: [{ name: "x", kind: 1024, comment: doc }] } },
				},
			],
			"pkg/src/index.ts"
		);
		expect(symbols.map((s) => [s.name, s.documented])).toEqual([
			["Options", true],
			["retries", false],
			["make", false],
			["x", true],
		]);
	});

	it("reads a comment from an accessor's get or set signature", () => {
		const symbols = countSymbols(
			[
				{ name: "g", kind: 262144, getSignature: { comment: doc } },
				{ name: "s", kind: 262144, setSignature: { comment: doc } },
				{ name: "none", kind: 262144 },
			],
			"pkg/src/index.ts"
		);
		expect(symbols.map((s) => s.documented)).toEqual([true, true, false]);
	});

	it("leaves out private, inherited and external members, and uses the fallback file when there is no source", () => {
		const symbols = countSymbols(
			[
				{ name: "p", kind: 1024, flags: { isPrivate: true } },
				{ name: "i", kind: 1024, inheritedFrom: {} },
				{ name: "e", kind: 128, flags: { isExternal: true } },
				{ name: "kept", kind: 2048 },
			],
			"pkg/src/index.ts"
		);
		expect(symbols).toEqual([
			{ kind: "Method", name: "kept", file: "pkg/src/index.ts", line: 1, documented: false },
		]);
	});

	it("leaves out a symbol, and its members, whose source is another package's build output", () => {
		const symbols = countSymbols(
			[
				{
					name: "client",
					kind: 1024,
					sources: [{ fileName: "clients/x-client/dist/index.d.mts", line: 8 }],
					children: [
						{
							name: "get",
							kind: 1024,
							sources: [{ fileName: "clients/x-client/dist/index.d.mts", line: 9 }],
						},
					],
				},
				{ name: "own", kind: 64, signatures: [{ sources: [{ fileName: "pkg/src/own.ts", line: 2 }] }] },
				{ name: "distinct", kind: 64, sources: [{ fileName: "pkg/src/distinct/a.ts", line: 1 }] },
			],
			"pkg/src/index.ts"
		);
		expect(symbols.map((s) => s.name)).toEqual(["own", "distinct"]);
	});

	it("is empty for a project with no exports", () => {
		expect(countSymbols(undefined, "x.ts")).toEqual([]);
	});
});
