import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { loadConfigDir } from "../load-config-dir/index.js";
import { writeConfigDir } from "./write-config-dir.js";

describe("writeConfigDir", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "datapad-write-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("writes a tree of files with their relative paths and returns the paths written", async () => {
		const written = await writeConfigDir({
			dir,
			files: [
				{ path: ".holocron/notifications.ts", content: "export default {};" },
				{ path: ".holocron/lib/channels.ts", content: "export const a = 1;" },
			],
		});
		expect(written).toEqual([join(dir, ".holocron/notifications.ts"), join(dir, ".holocron/lib/channels.ts")]);
		expect(await readFile(join(dir, ".holocron/lib/channels.ts"), "utf8")).toBe("export const a = 1;");
	});

	it("writes nothing for an empty tree", async () => {
		expect(await writeConfigDir({ dir, files: [] })).toEqual([]);
	});

	it("lets loadConfigDir load an area that imports a written sibling", async () => {
		await writeConfigDir({
			dir,
			files: [
				{
					path: ".holocron/repo.ts",
					content: `import { topics } from "./lib/topics.js";\nexport default { topics };`,
				},
				{ path: ".holocron/lib/topics.ts", content: `export const topics = ["t"];` },
			],
		});
		const [area] = await loadConfigDir({ cwd: dir, dir: ".holocron", areas: ["repo"] });
		expect(area?.value).toEqual({ topics: ["t"] });
	});

	it.each(["../escape.ts", ".holocron/../../escape.ts", "/etc/escape.ts", "."])(
		"refuses %s and writes none of the files",
		async (path) => {
			const err = await writeConfigDir({
				dir,
				files: [
					{ path: ".holocron/ok.json", content: "{}" },
					{ path, content: "x" },
				],
			}).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ConfigFileError);
			await expect(readFile(join(dir, ".holocron/ok.json"), "utf8")).rejects.toThrow();
		}
	);
});
