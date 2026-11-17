import { describe, expect, it } from "vitest";

import { resolveExportDir } from "./resolve-export-dir.js";

const base = {
	repoRoot: "/repo",
	provider: "bruno",
	files: ["api/webhook.collection.json", "api/webhook.environment.json"],
};

describe("resolveExportDir", () => {
	it("defaults to .export/<provider> beside the first collection file", () => {
		expect(resolveExportDir(base)).toEqual({ ok: true, dir: "/repo/api/.export/bruno" });
	});

	it("puts a provider folder under --out, relative to the repo root or absolute", () => {
		expect(resolveExportDir({ ...base, out: "build/requests" })).toEqual({
			ok: true,
			dir: "/repo/build/requests/bruno",
		});
		expect(resolveExportDir({ ...base, out: "/tmp/x" })).toEqual({ ok: true, dir: "/tmp/x/bruno" });
	});

	it("refuses a folder that is the source folder", () => {
		const result = resolveExportDir({ ...base, out: "api/..", provider: "api" });
		expect(result.ok).toBe(false);
		expect((result as { message: string }).message).toContain("never writes there");
	});

	it("refuses a folder that holds the source folder", () => {
		const result = resolveExportDir({
			...base,
			files: ["api/webhook.collection.json"],
			out: ".",
			provider: "api",
		});
		expect(result.ok).toBe(false);
	});

	it("allows a folder below the source folder, and refuses the source folder itself", () => {
		expect(resolveExportDir({ ...base, files: ["a/b/collection.json"], out: "a", provider: "b" }).ok).toBe(false);
		expect(resolveExportDir({ ...base, files: ["a/b/collection.json"], out: "a/b" }).ok).toBe(true);
	});

	it("needs a file or --out to know where to write", () => {
		const result = resolveExportDir({ ...base, files: [] });
		expect(result.ok).toBe(false);
		expect((result as { message: string }).message).toContain("no collection file");
		expect(resolveExportDir({ ...base, files: [], out: "x" })).toEqual({ ok: true, dir: "/repo/x/bruno" });
	});
});
