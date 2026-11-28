import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { transformTemplate } from "./index.js";

describe("transformTemplate", () => {
	it("transforms .yml files into default-exported string literals", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rtt-test-"));
		try {
			const id = join(dir, "a.yml");
			await writeFile(id, "key: value\n", "utf8");
			const plugin = transformTemplate();
			const result = (plugin as { transform: (code: string, id: string) => { code: string } | null }).transform(
				"",
				id
			);
			expect(result).not.toBeNull();
			expect(result!.code).toBe(`export default "key: value\\n";`);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("transforms .md files into default-exported string literals", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rtt-test-"));
		try {
			const id = join(dir, "a.md");
			await writeFile(id, "# Title\n", "utf8");
			const plugin = transformTemplate();
			const result = (plugin as { transform: (code: string, id: string) => { code: string } | null }).transform(
				"",
				id
			);
			expect(result).not.toBeNull();
			expect(result!.code).toBe(`export default "# Title\\n";`);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
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
			expect(result!.code).toBe(`export default "#!/bin/sh\\n";`);
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

	it("strips query suffixes before matching and reading", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rtt-test-"));
		try {
			const file = join(dir, "a.yml");
			await writeFile(file, "k: v\n", "utf8");
			const plugin = transformTemplate();
			const result = (plugin as { transform: (code: string, id: string) => { code: string } | null }).transform(
				"",
				`${file}?raw`
			);
			expect(result!.code).toBe(`export default "k: v\\n";`);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("never transforms .mts/.cts sources, virtual modules or node_modules files", () => {
		const plugin = transformTemplate({ dirs: ["/templates/"] }) as {
			transform: (code: string, id: string) => null;
		};
		expect(plugin.transform("", "/templates/a.mts")).toBeNull();
		expect(plugin.transform("", "/templates/a.cts")).toBeNull();
		expect(plugin.transform("", "\0virtual.yml")).toBeNull();
		expect(plugin.transform("", "/x/node_modules/dep/secret.md")).toBeNull();
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
