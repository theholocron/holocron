import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildZip } from "../zip.js";

let tmpDir: string | undefined;

afterEach(() => {
	if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
	tmpDir = undefined;
});

/** Writes the zip to a real temp file and extracts it with the system `unzip` — the only reliable way to confirm the hand-rolled writer produces a spec-valid archive, not just bytes this package's own reader would accept. */
function extract(zip: Uint8Array): string {
	tmpDir = mkdtempSync(join(tmpdir(), "netlify-client-zip-test-"));
	const zipPath = join(tmpDir, "test.zip");
	writeFileSync(zipPath, zip);
	execFileSync("unzip", ["-o", zipPath, "-d", tmpDir]);
	return tmpDir;
}

describe("buildZip", () => {
	it("round-trips text content through a real unzip", () => {
		const zip = buildZip({ "hello.txt": "hello world\n" });
		const dir = extract(zip);
		expect(readFileSync(join(dir, "hello.txt"), "utf8")).toBe("hello world\n");
	});

	it("round-trips binary content unchanged", () => {
		const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 127, 128]);
		const zip = buildZip({ "data.bin": bytes });
		const dir = extract(zip);
		expect(new Uint8Array(readFileSync(join(dir, "data.bin")))).toEqual(bytes);
	});

	it("preserves nested directory paths", () => {
		const zip = buildZip({ "dir/nested.txt": "nested" });
		const dir = extract(zip);
		expect(readFileSync(join(dir, "dir", "nested.txt"), "utf8")).toBe("nested");
	});

	it("strips a leading slash from entry paths", () => {
		const zip = buildZip({ "/rooted.txt": "x" });
		const dir = extract(zip);
		expect(readFileSync(join(dir, "rooted.txt"), "utf8")).toBe("x");
	});

	it("handles multiple entries and passes unzip's own integrity check", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "netlify-client-zip-test-"));
		const zipPath = join(tmpDir, "test.zip");
		const zip = buildZip({ "a.txt": "A", "b/c.txt": "C", "empty.txt": "" });
		writeFileSync(zipPath, zip);
		// -t verifies CRC-32 for every entry — a corrupt writer (wrong size,
		// bad CRC, misaligned central directory offset) fails this even if
		// individual extraction above happened to still work.
		expect(() => execFileSync("unzip", ["-t", zipPath])).not.toThrow();
	});
});
