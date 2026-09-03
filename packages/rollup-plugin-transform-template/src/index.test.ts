import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { transformTemplate } from "./index.js";

describe("transformTemplate", () => {
	it("transforms .yml files into default-exported string literals", async () => {
		const id = join(tmpdir(), `rtt-test-${Date.now()}.yml`);
		await writeFile(id, "key: value\n", "utf8");
		const plugin = transformTemplate();
		const result = (plugin as { transform: (code: string, id: string) => { code: string } | null }).transform(
			"",
			id
		);
		expect(result).not.toBeNull();
		expect(result!.code).toBe(`export default "key: value\\n";`);
	});

	it("transforms .md files into default-exported string literals", async () => {
		const id = join(tmpdir(), `rtt-test-${Date.now()}.md`);
		await writeFile(id, "# Title\n", "utf8");
		const plugin = transformTemplate();
		const result = (plugin as { transform: (code: string, id: string) => { code: string } | null }).transform(
			"",
			id
		);
		expect(result).not.toBeNull();
		expect(result!.code).toContain("# Title");
	});

	it("transforms files inside configured dirs regardless of extension", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rtt-test-"));
		try {
			const id = join(dir, "prepare-commit-msg");
			await writeFile(id, "#!/bin/sh\n", "utf8");
			const plugin = transformTemplate({ dirs: [dir] });
			const result = (plugin as { transform: (code: string, id: string) => { code: string } | null }).transform(
				"",
				id
			);
			expect(result).not.toBeNull();
			expect(result!.code).toContain("#!/bin/sh");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns null for .json files even when inside a configured dir", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rtt-test-"));
		try {
			const id = join(dir, "config.json");
			await writeFile(id, '{"key":"value"}\n', "utf8");
			const plugin = transformTemplate({ dirs: [dir] });
			const result = (plugin as { transform: (code: string, id: string) => null }).transform("", id);
			expect(result).toBeNull();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns null for unrelated files not in any configured dir", () => {
		const plugin = transformTemplate({ dirs: ["/my/templates/"] });
		const result = (plugin as { transform: (code: string, id: string) => null }).transform("", "/src/foo.ts");
		expect(result).toBeNull();
	});

	it("uses the plugin name rollup-plugin-transform-template", () => {
		const plugin = transformTemplate();
		expect((plugin as { name: string }).name).toBe("rollup-plugin-transform-template");
	});
});
