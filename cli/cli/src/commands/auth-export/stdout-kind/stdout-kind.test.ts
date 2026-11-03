import { mkdtempSync, writeFileSync } from "node:fs";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stdoutKind } from "./stdout-kind.js";

const stat = (kind: "fifo" | "socket" | "file") => () => ({
	isFIFO: () => kind === "fifo",
	isSocket: () => kind === "socket",
});

describe("stdoutKind", () => {
	it("is a terminal when stdout is one, whatever the descriptor", () => {
		expect(stdoutKind(true, 1, stat("file"))).toBe("terminal");
	});

	it("is a pipe for a FIFO and for a socket", () => {
		expect(stdoutKind(false, 1, stat("fifo"))).toBe("pipe");
		expect(stdoutKind(false, 1, stat("socket"))).toBe("pipe");
	});

	it("is other for a regular file, and for a descriptor that cannot be inspected", () => {
		expect(stdoutKind(false, 1, stat("file"))).toBe("other");
		expect(
			stdoutKind(false, 1, () => {
				throw new Error("EBADF");
			})
		).toBe("other");
	});

	it("reads a real regular file as other", () => {
		const file = join(mkdtempSync(join(tmpdir(), "holocron-stdout-")), "out.env");
		writeFileSync(file, "");
		expect(stdoutKind(false, openSync(file, "r"))).toBe("other");
	});
});
