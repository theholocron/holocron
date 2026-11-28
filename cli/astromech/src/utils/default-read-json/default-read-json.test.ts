import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultReadJson } from "./default-read-json.js";

describe("defaultReadJson", () => {
	const dirs: string[] = [];
	const tmp = () => {
		const dir = mkdtempSync(join(tmpdir(), "deploy-on-release-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("defaultReadJson parses a file, and throws for a missing one", () => {
		const dir = tmp();
		writeFileSync(join(dir, "a.json"), '{"name":"x"}');
		expect(defaultReadJson(join(dir, "a.json"))).toEqual({ name: "x" });
		expect(() => defaultReadJson(join(dir, "missing.json"))).toThrow();
	});
});
