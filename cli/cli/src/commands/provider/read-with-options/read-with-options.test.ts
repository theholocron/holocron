import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "../../../config/index.js";
import { readWithOptions } from "./read-with-options.js";

describe("readWithOptions", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "with-options-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("returns undefined when --with was not given or is empty", async () => {
		expect(await readWithOptions(undefined, dir)).toBeUndefined();
		expect(await readWithOptions([], dir)).toBeUndefined();
	});

	it("reads key=value pairs as text", async () => {
		expect(await readWithOptions(["team=ENG", "project=Roadmap"], dir)).toEqual({
			team: "ENG",
			project: "Roadmap",
		});
	});

	it("reads a JSON file relative to the directory, keeping lists and nested objects", async () => {
		const block = { team: "ENG", labels: ["bug"], automation: { autoClose: { months: 3 } } };
		await writeFile(join(dir, "linear-trial.json"), JSON.stringify(block));
		expect(await readWithOptions(["linear-trial.json"], dir)).toEqual(block);
	});

	it("reads the default export of a module", async () => {
		await writeFile(join(dir, "opts.mjs"), 'export default { team: "OPS" };');
		expect(await readWithOptions([join(dir, "opts.mjs")], "/elsewhere")).toEqual({ team: "OPS" });
	});

	it("lays later values over earlier ones, one key at a time", async () => {
		await writeFile(join(dir, "a.json"), '{"team":"ENG","labels":["x"],"automation":{"a":1}}');
		await writeFile(join(dir, "b.json"), '{"automation":{"b":2}}');
		expect(await readWithOptions(["a.json", "team=OPS", "b.json"], dir)).toEqual({
			team: "OPS",
			labels: ["x"],
			automation: { b: 2 },
		});
	});

	it("names the flag value in a ConfigError for a missing file", async () => {
		const err = await readWithOptions(["nope.json"], dir).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/^--with nope\.json: .*is not a file/);
	});

	it("rejects a file that does not hold an object", async () => {
		await writeFile(join(dir, "list.json"), "[1]");
		await writeFile(join(dir, "null.mjs"), "export default 7;");
		for (const name of ["list.json", "null.mjs"]) {
			const err = await readWithOptions([name], dir).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(ConfigError);
			expect((err as Error).message).toBe(`--with ${name}: must hold an object of the provider's options`);
		}
	});

	it("rejects invalid JSON as a ConfigError", async () => {
		await writeFile(join(dir, "bad.json"), "{");
		const err = await readWithOptions(["bad.json"], dir).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
		expect((err as Error).message).toMatch(/not valid JSON/);
	});
});
