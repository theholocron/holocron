import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createRealStartWorkIo } from "./real-start-work-io.js";

describe("createRealStartWorkIo", () => {
	it("writes into a folder it makes, reads it back and knows it exists", () => {
		const io = createRealStartWorkIo();
		const file = join(mkdtempSync(join(tmpdir(), "start-work-")), "a", "b.md");
		expect(io.exists(file)).toBe(false);
		io.write(file, "text");
		expect(io.exists(file)).toBe(true);
		expect(io.read(file)).toBe("text");
	});

	it("gives today as YYYY-MM-DD", () => {
		expect(createRealStartWorkIo().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("runs the version control program, which here only reports its version", () => {
		expect(createRealStartWorkIo().git(["--version"], tmpdir())).toMatch(/^git version/);
	});
});
