import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { loadConfigDir } from "./load-config-dir.js";

describe("loadConfigDir", () => {
	let cwd: string;
	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "datapad-dir-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	const write = async (name: string, content: string) => {
		await mkdir(join(cwd, ".holocron"), { recursive: true });
		await writeFile(join(cwd, ".holocron", name), content, "utf8");
	};

	it("loads an area written as .ts", async () => {
		await write("notifications.ts", `export default { relay: "x" } as const;`);
		const [area] = await loadConfigDir({ cwd, dir: ".holocron", areas: ["notifications"] });
		expect(area).toEqual({
			area: "notifications",
			path: ".holocron/notifications.ts",
			extension: "ts",
			filepath: join(cwd, ".holocron", "notifications.ts"),
			value: { relay: "x" },
		});
	});

	it("loads an area written as .json", async () => {
		await write("repo.json", JSON.stringify({ topics: ["a"] }));
		const areas = await loadConfigDir({ cwd, dir: ".holocron", areas: ["repo"] });
		expect(areas).toHaveLength(1);
		expect(areas[0]).toMatchObject({ area: "repo", extension: "json", value: { topics: ["a"] } });
	});

	it("prefers .ts over .json when an area has both files", async () => {
		await write("repo.ts", `export default { from: "ts" };`);
		await write("repo.json", JSON.stringify({ from: "json" }));
		const [area] = await loadConfigDir({ cwd, dir: ".holocron", areas: ["repo"] });
		expect(area?.value).toEqual({ from: "ts" });
	});

	it("loads an area file that imports a sibling", async () => {
		await write("shared.ts", `export const topics = ["shared"];`);
		await write("repo.ts", `import { topics } from "./shared.js";\nexport default { topics };`);
		const [area] = await loadConfigDir({ cwd, dir: ".holocron", areas: ["repo"] });
		expect(area?.value).toEqual({ topics: ["shared"] });
	});

	it("returns [] for a missing directory", async () => {
		expect(await loadConfigDir({ cwd, dir: ".holocron", areas: ["notifications", "repo"] })).toEqual([]);
	});

	it("reads only the named areas, never a stray file", async () => {
		await write("stray.ts", `throw new Error("must not run");`);
		await write("repo.json", "{}");
		const areas = await loadConfigDir({ cwd, dir: ".holocron", areas: ["notifications", "repo"] });
		expect(areas.map((a) => a.area)).toEqual(["repo"]);
	});

	it("throws ConfigFileError for a file that cannot be loaded", async () => {
		await write("notifications.ts", `throw new Error("boom");`);
		const err = await loadConfigDir({ cwd, dir: ".holocron", areas: ["notifications"] }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/could not load/);
	});

	it("throws ConfigFileError for invalid JSON", async () => {
		await write("repo.json", "{ nope");
		const err = await loadConfigDir({ cwd, dir: ".holocron", areas: ["repo"] }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/not valid JSON/);
	});

	describe("shared areas", () => {
		let app: string;
		beforeEach(async () => {
			// `cwd` is the repository root (it has a `.git`); the app sits one level down.
			await mkdir(join(cwd, ".git"), { recursive: true });
			app = join(cwd, "apps", "demo");
			await mkdir(join(app, ".holocron"), { recursive: true });
		});
		const root = async (name: string, content: string) => {
			await mkdir(join(cwd, ".holocron"), { recursive: true });
			await writeFile(join(cwd, ".holocron", name), content, "utf8");
		};
		const own = (name: string, content: string) => writeFile(join(app, ".holocron", name), content, "utf8");
		const load = () => loadConfigDir({ cwd: app, dir: ".holocron", areas: ["org", "repo"], shared: ["org"] });

		it("returns the root's file, its path relative to the app, when only the root has the area", async () => {
			await root("org.json", JSON.stringify({ a: 1 }));
			const [area] = await load();
			expect(area).toMatchObject({ area: "org", path: "../../.holocron/org.json", value: { a: 1 } });
			expect(area?.root).toBeUndefined();
		});

		it("returns the app's file with the root's as `root` when both have the area", async () => {
			await root("org.json", JSON.stringify({ a: 1 }));
			await own("org.ts", `export default { a: 2 };`);
			const [area] = await load();
			expect(area).toMatchObject({ path: ".holocron/org.ts", value: { a: 2 }, root: { value: { a: 1 } } });
		});

		it("returns only the app's file when the root has none", async () => {
			await own("org.json", JSON.stringify({ a: 2 }));
			const [area] = await load();
			expect(area?.root).toBeUndefined();
			expect(area?.value).toEqual({ a: 2 });
		});

		it("never reads an area from the root unless it is shared", async () => {
			await root("repo.json", JSON.stringify({ topics: ["x"] }));
			expect(await load()).toEqual([]);
		});

		it("has nothing to inherit when the directory is the root itself", async () => {
			await root("org.json", JSON.stringify({ a: 1 }));
			const areas = await loadConfigDir({ cwd, dir: ".holocron", areas: ["org"], shared: ["org"] });
			expect(areas).toHaveLength(1);
			expect(areas[0]?.root).toBeUndefined();
		});
	});
});
