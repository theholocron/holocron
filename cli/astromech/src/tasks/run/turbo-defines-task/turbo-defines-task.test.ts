import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { turboDefinesTask } from "./turbo-defines-task.js";

const TURBO = join("/r", "turbo.json");

/** Answers only for `/r/turbo.json`; `turbo` is the file's text, or `undefined` for no file. */
const fs = (turbo: string | undefined) => ({
	readFile: (path: string) => {
		if (path !== TURBO) throw new Error(`unexpected read of ${path}`);
		return turbo ?? "";
	},
	fileExists: (path: string) => path === TURBO && turbo !== undefined,
});

describe("turboDefinesTask", () => {
	it("is true when turbo.json lists the task under `tasks` or the legacy `pipeline`", () => {
		const a = fs('{"tasks":{"build":{}}}');
		const b = fs('{"pipeline":{"build":{}}}');
		expect(turboDefinesTask("/r", "build", a.readFile, a.fileExists)).toBe(true);
		expect(turboDefinesTask("/r", "build", b.readFile, b.fileExists)).toBe(true);
	});

	it("is false for another task, an unreadable file or no turbo.json", () => {
		const a = fs('{"tasks":{"build":{}}}');
		const bad = fs("{ nope");
		const none = fs(undefined);
		expect(turboDefinesTask("/r", "test", a.readFile, a.fileExists)).toBe(false);
		expect(turboDefinesTask("/r", "build", bad.readFile, bad.fileExists)).toBe(false);
		expect(turboDefinesTask("/r", "build", none.readFile, none.fileExists)).toBe(false);
	});
});
