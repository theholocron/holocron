import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lockConfig } from "./lock-config.js";

describe("lockConfig", () => {
	it("is held by one caller at a time and free again once released", async () => {
		const file = join(await mkdtemp(join(tmpdir(), "lock-")), "holocron.config.ts");
		await writeFile(file, "");
		const first = await lockConfig(file);
		expect(first).toBeDefined();
		expect(await lockConfig(file)).toBeUndefined();
		await first!.release();
		await expect(access(first!.path)).rejects.toThrow();
		const again = await lockConfig(file);
		expect(again).toBeDefined();
		await again!.release();
		await again!.release(); // releasing twice is harmless
	});

	it("lets an unexpected error through", async () => {
		await expect(lockConfig("/nonexistent-dir/holocron.config.ts")).rejects.toThrow();
	});
});
