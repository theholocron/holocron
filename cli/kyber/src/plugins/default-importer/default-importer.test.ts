import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultImporter } from "./default-importer.js";

vi.mock("node:module", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:module")>();
	return { ...actual, createRequire: vi.fn(actual.createRequire) };
});

afterEach(() => {
	vi.mocked(createRequire).mockRestore();
});

describe("defaultImporter", () => {
	it("resolves the package from the working directory first", async () => {
		const selfPath = new URL("./default-importer.test.ts", import.meta.url).pathname;
		const resolve = vi.fn().mockReturnValue(selfPath);
		vi.mocked(createRequire).mockReturnValueOnce({ resolve } as unknown as ReturnType<typeof createRequire>);
		const mod = await defaultImporter("some-package");
		expect(resolve).toHaveBeenCalledWith("some-package");
		expect(mod).toBeDefined();
	});

	it("falls back to a plain import, which rejects for a package that does not exist", async () => {
		await expect(defaultImporter("no-such-package-xz9")).rejects.toThrow();
	});
});
