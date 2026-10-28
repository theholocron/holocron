import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isStale } from "./build-cli.js";

describe("isStale", () => {
	let dir: string;
	const touch = (path: string, secondsAgo: number) => {
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, "x");
		const t = new Date(Date.now() - secondsAgo * 1000);
		utimesSync(path, t, t);
	};

	beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "stale-"))));
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("is stale when there is no build", () => {
		touch(join(dir, "src", "a.ts"), 10);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"))).toBe(true);
	});

	it("is stale when a source file is newer than the build, at any depth", () => {
		touch(join(dir, "dist", "cli.mjs"), 10);
		touch(join(dir, "src", "deep", "er", "a.ts"), 1);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"))).toBe(true);
	});

	it("is fresh when the build is newer than every source file, whatever the tests and helpers say", () => {
		touch(join(dir, "src", "a.ts"), 30);
		touch(join(dir, "src", "a.test.ts"), 1);
		touch(join(dir, "src", "testing", "helper.ts"), 1);
		touch(join(dir, "dist", "cli.mjs"), 10);
		expect(isStale(join(dir, "dist", "cli.mjs"), join(dir, "src"))).toBe(false);
	});
});
