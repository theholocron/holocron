import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { loadConfigPath } from "./load-config-path.js";

describe("loadConfigPath", () => {
	let root: string;
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "datapad-path-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("parses a JSON file under any name", async () => {
		await writeFile(join(root, "linear-trial.json"), '{"team":"ENG"}');
		expect(await loadConfigPath(join(root, "linear-trial.json"))).toEqual({ team: "ENG" });
	});

	it("imports the default export of a module", async () => {
		await writeFile(join(root, "opts.mjs"), 'export default { team: "ENG", labels: ["bug"] };');
		expect(await loadConfigPath(join(root, "opts.mjs"))).toEqual({ team: "ENG", labels: ["bug"] });
	});

	it("throws ConfigFileError for a missing file", async () => {
		const err = await loadConfigPath(join(root, "none.json")).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as Error).message).toMatch(/is not a file/);
	});

	it("throws ConfigFileError for an extension it cannot load", async () => {
		await writeFile(join(root, "opts.yaml"), "team: ENG");
		const err = await loadConfigPath(join(root, "opts.yaml")).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as Error).message).toMatch(/must be a \.ts, \.js/);
	});
});
