import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { rootVersion, stripVersion, withVersion } from "./collection-version.js";

const FILE = "opencollection: 1.0.0\n\ninfo:\n  name: Demo\n\nrequest:\n  variables:\n    - name: version\n";

describe("withVersion", () => {
	it("puts the version right after the name, as a quoted string", () => {
		expect(withVersion("info:\n  name: Demo\n\nrequest: {}\n", "5.0.0-alpha.461")).toBe(
			'info:\n  name: Demo\n  version: "5.0.0-alpha.461"\n\nrequest: {}\n'
		);
	});

	it("replaces a version that is already there, and is the same text the second time", () => {
		const once = withVersion("info:\n  name: Demo\n  version: old\n", "2.0.0");
		expect(once).toBe('info:\n  name: Demo\n  version: "2.0.0"\n');
		expect(withVersion(once, "2.0.0")).toBe(once);
	});

	it("leaves a file alone when its info block is not the layout the sync writes", () => {
		expect(withVersion("something: else\n", "1.0.0")).toBe("something: else\n");
	});
});

describe("stripVersion", () => {
	it("takes out only the info block's version, so a variable called version stays", () => {
		const text = `${FILE}`.replace("name: Demo\n", 'name: Demo\n  version: "1"\n');
		expect(stripVersion(text)).toBe(FILE);
	});

	it("is the text itself when there is no version", () => {
		expect(stripVersion(FILE)).toBe(FILE);
	});

	it("makes two texts that differ only by version the same", () => {
		expect(stripVersion(withVersion(FILE, "1.0.0"))).toBe(stripVersion(withVersion(FILE, "2.0.0")));
	});
});

describe("rootVersion", () => {
	let root: string;
	afterEach(() => rmSync(root, { recursive: true, force: true }));
	const repo = (files: Record<string, string>) => {
		root = mkdtempSync(join(tmpdir(), "bruno-version-"));
		for (const [name, text] of Object.entries(files)) {
			mkdirSync(join(root, name, ".."), { recursive: true });
			writeFileSync(join(root, name), text);
		}
		return root;
	};

	it("reads the root package's version", async () => {
		expect(await rootVersion(repo({ "package.json": '{ "version": "5.0.0-alpha.461" }' }))).toBe("5.0.0-alpha.461");
	});

	it("is undefined with no package.json, an unreadable one, or no version", async () => {
		expect(await rootVersion(repo({}))).toBeUndefined();
		expect(await rootVersion(repo({ "package.json": "not json" }))).toBeUndefined();
		expect(await rootVersion(repo({ "package.json": '{ "name": "x" }' }))).toBeUndefined();
		expect(await rootVersion(repo({ "package.json": '{ "version": "" }' }))).toBeUndefined();
	});
});
