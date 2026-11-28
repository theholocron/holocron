import { describe, expect, it } from "vitest";

import { detectNodeMajor } from "./detect-node-major.js";

const reader = (files: Record<string, string>) => (p: string) => {
	const hit = Object.entries(files).find(([name]) => p.endsWith(name));
	if (!hit) throw new Error("ENOENT");
	return hit[1];
};

describe("detectNodeMajor", () => {
	it("prefers .nvmrc, then .node-version", () => {
		expect(detectNodeMajor("/r", reader({ ".nvmrc": "20\n", ".node-version": "18" }))).toBe(20);
		expect(detectNodeMajor("/r", reader({ ".node-version": "18.1.0" }))).toBe(18);
	});

	it("falls back to engines.node", () => {
		expect(detectNodeMajor("/r", reader({ "package.json": '{"engines":{"node":">=22.0.0"}}' }))).toBe(22);
	});

	it("skips a non-numeric pin file", () => {
		expect(
			detectNodeMajor("/r", reader({ ".nvmrc": "lts/*", "package.json": '{"engines":{"node":">=20"}}' }))
		).toBe(20);
	});

	it("returns null when nothing pins a version", () => {
		expect(detectNodeMajor("/r", reader({ "package.json": "{}" }))).toBeNull();
		expect(detectNodeMajor("/r", reader({ "package.json": '{"engines":{"node":"lts"}}' }))).toBeNull();
		expect(detectNodeMajor("/r", reader({}))).toBeNull();
	});
});
