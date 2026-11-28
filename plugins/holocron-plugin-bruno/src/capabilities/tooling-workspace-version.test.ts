import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrunoTooling, type BrunoToolingOptions } from "./tooling.js";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const OWN = ".bruno/collections/demo/opencollection.yml";

let root: string;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const write = (path: string, text: string) => {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), text);
};
const setVersion = (version: string | undefined) =>
	write("package.json", JSON.stringify(version === undefined ? { name: "x" } : { name: "x", version }));
const versionOf = (text: string) => /^ {2}version: (.*)$/m.exec(text)?.[1];

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bruno-version-sync-"));
	write(
		"api/demo.collection.json",
		JSON.stringify({
			info: { name: "Demo", schema: SCHEMA },
			item: [{ name: "ping", request: { method: "GET", url: "http://x" } }],
		})
	);
	setVersion("5.0.0-alpha.1");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (over: Record<string, unknown> = {}, options: BrunoToolingOptions = {}) =>
	new BrunoTooling({ repoRoot: root, workspaceName: "W", ...options }).workspace({
		collectionFiles: ["api/demo.collection.json"],
		envFiles: [],
		repoRoot: root,
		...over,
	});
const states = (files: { path: string; state: string }[]) => new Set(files.map((file) => file.state));

describe("the collection's info.version", () => {
	it("is the root package's version, written with the collection file", async () => {
		await run();
		expect(versionOf(read(OWN))).toBe('"5.0.0-alpha.1"');
		expect(read(OWN)).toMatch(/^info:\n {2}name: Demo\n {2}version: "5.0.0-alpha.1"\n/m);
	});

	it("leaves the file as it is when it already holds the current version", async () => {
		await run();
		const before = read(OWN);
		const result = await run();
		expect(states(result.files)).toEqual(new Set(["unchanged"]));
		expect(read(OWN)).toBe(before);
	});

	it("is never a reason for a file to be out of date: a newer root version leaves a check in sync", async () => {
		await run();
		setVersion("5.0.0-alpha.2");
		const before = read(OWN);
		const result = await run({ dryRun: true });
		expect(states(result.files)).toEqual(new Set(["unchanged"]));
		expect(read(OWN)).toBe(before);
	});

	it("is brought up to date by a run that is not a dry run, with nothing else changed", async () => {
		await run();
		const baseline = read(".bruno/.sync.json");
		setVersion("5.0.0-alpha.2");
		const result = await run();
		expect(states(result.files)).toEqual(new Set(["unchanged"]));
		expect(versionOf(read(OWN))).toBe('"5.0.0-alpha.2"');
		expect(read(".bruno/.sync.json")).toBe(baseline);
	});

	it("does not make a hand-edited version look like a change in the workspace", async () => {
		await run();
		write(OWN, read(OWN).replace('"5.0.0-alpha.1"', '"edited"'));
		const result = await run({ dryRun: true });
		expect(states(result.files)).toEqual(new Set(["unchanged"]));
	});

	it("goes with the file when it is rewritten for another reason", async () => {
		await run();
		setVersion("5.0.0-alpha.3");
		write(
			"api/demo.collection.json",
			JSON.stringify({
				info: { name: "Demo", schema: SCHEMA },
				item: [{ name: "ping", request: { method: "GET", url: "http://y" } }],
			})
		);
		await run();
		expect(versionOf(read(OWN))).toBe('"5.0.0-alpha.3"');
		expect(read(".bruno/collections/demo/ping.yml")).toContain("http://y");
	});

	it("can be named by the `version` option instead of the root package", async () => {
		await run({}, { version: "9.9.9" });
		expect(versionOf(read(OWN))).toBe('"9.9.9"');
	});

	it("is left out when the repo has no version to give", async () => {
		setVersion(undefined);
		await run();
		expect(versionOf(read(OWN))).toBeUndefined();
		expect(read(OWN)).not.toContain("version:");
	});
});
