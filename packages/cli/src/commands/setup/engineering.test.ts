import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installEngineeringStructure } from "./engineering.js";

describe("installEngineeringStructure", () => {
	let tmpDir: string;
	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-engineering-test-"));
	});
	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("creates docs/wiki/{decisions,standards,specifications}/ files", async () => {
		await installEngineeringStructure({ repoRoot: tmpDir });

		await expect(stat(join(tmpDir, "docs/wiki/decisions/template.md"))).resolves.toBeDefined();
		await expect(stat(join(tmpDir, "docs/wiki/decisions/README.md"))).resolves.toBeDefined();
		await expect(stat(join(tmpDir, "docs/wiki/standards/README.md"))).resolves.toBeDefined();
		await expect(stat(join(tmpDir, "docs/wiki/specifications/README.md"))).resolves.toBeDefined();
	});

	it("skips files that already exist", async () => {
		await mkdir(join(tmpDir, "docs/wiki/decisions"), { recursive: true });
		await writeFile(join(tmpDir, "docs/wiki/decisions/template.md"), "custom content");

		await installEngineeringStructure({ repoRoot: tmpDir });

		const content = await readFile(join(tmpDir, "docs/wiki/decisions/template.md"), "utf8");
		expect(content).toBe("custom content");
	});

	it("reports created files in the summary", async () => {
		const result = await installEngineeringStructure({ repoRoot: tmpDir });
		expect(result).toContain("docs/wiki/decisions/template.md");
		expect(result).toContain("docs/wiki/decisions/README.md");
		expect(result).toContain("docs/wiki/standards/README.md");
		expect(result).toContain("docs/wiki/specifications/README.md");
	});

	it("reports nothing to write when all files exist", async () => {
		await installEngineeringStructure({ repoRoot: tmpDir });
		const result = await installEngineeringStructure({ repoRoot: tmpDir });
		expect(result).toBe("all files already exist — nothing to write");
	});
});
