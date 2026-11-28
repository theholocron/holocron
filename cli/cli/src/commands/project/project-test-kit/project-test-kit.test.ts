import { describe, expect, it } from "vitest";

import { fakeProjects, loadedWith, loaderFor, memoryIo, promptOf } from "./project-test-kit.js";

describe("project test kit", () => {
	it("memoryIo reads a missing file as empty", async () => {
		const io = memoryIo({ "a.json": "{}" });
		expect(await io.listFiles("x")).toEqual(["a.json"]);
		expect(await io.readFile("dir/a.json")).toBe("{}");
		expect(await io.readFile("dir/missing.json")).toBe("");
	});

	it("promptOf selects the first choice, or an empty string when there is none", async () => {
		const prompt = promptOf();
		expect(await prompt.select("pick", ["a", "b"])).toBe("a");
		expect(await prompt.select("pick", [])).toBe("");
	});

	it("fakeProjects keeps a non-function override as it is", () => {
		expect(fakeProjects({ read: 5 }).read).toBe(5);
	});

	it("loaderFor refuses to import any package but the GitHub plugin", async () => {
		const loaded = loadedWith({ projects: "github", vault: "doppler" });
		const loader = loaderFor(loaded, fakeProjects());
		await loader.load();
		expect(loader.has("projects")).toBe(true);
		expect(loader.loadFailures().map((f) => f.key)).toContain("vault");
	});
});
