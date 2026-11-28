import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { diskIo } from "./disk-io.js";

describe("diskIo", () => {
	it("reads null for a missing file, writes into a folder it makes, and reads it back", async () => {
		const dir = await mkdtemp(join(tmpdir(), "dns-records-"));
		try {
			const file = join(dir, ".holocron", "dns-records.json");
			expect(await diskIo.read(file)).toBeNull();
			await diskIo.write(file, "[]\n");
			expect(await readFile(file, "utf8")).toBe("[]\n");
			expect(await diskIo.read(file)).toBe("[]\n");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("rethrows a read that fails for another reason", async () => {
		const err = await diskIo.read(tmpdir()).catch((e: unknown) => e);
		expect((err as NodeJS.ErrnoException).code).toBe("EISDIR");
	});
});
