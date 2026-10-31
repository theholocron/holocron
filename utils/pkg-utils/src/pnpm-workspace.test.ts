import { describe, expect, it } from "vitest";

import { addWorkspaceMember, bumpCatalogPins, type FetchLatest, gt, parseCatalogs } from "./pnpm-workspace.ts";

// one string per line: the YAML needs its own spaces, and a template literal's would break the repo's tabs rule
const YAML =
	[
		"packages:",
		"  - cli/*",
		"",
		"catalog:",
		'  "@types/node": ^26',
		"  typescript: ^5.9.3",
		"  tsx: 4.23.15",
		"",
		"catalogs:",
		"  cli:",
		"    yargs: ^18.1.0",
		"  peers:",
		'    "@theholocron/widget-client": ^1.2.0',
		"",
		"overrides:",
		"  cookie: ^2.0.1",
	].join("\n") + "\n";

describe("parseCatalogs", () => {
	it("reads the default catalog and the named ones, quoted keys included", () => {
		const catalogs = parseCatalogs(YAML);
		expect(catalogs["default"]).toEqual({ "@types/node": "^26", typescript: "^5.9.3", tsx: "4.23.15" });
		expect(catalogs["cli"]).toEqual({ yargs: "^18.1.0" });
		expect(catalogs["peers"]).toEqual({ "@theholocron/widget-client": "^1.2.0" });
	});

	it("stops at the next top-level key", () => {
		expect(parseCatalogs(YAML)["default"]?.["cookie"]).toBeUndefined();
	});

	it("skips comments and blank lines, and ignores entries outside a catalog", () => {
		const catalogs = parseCatalogs("# note\n\ncatalog:\n  # inner\n  a: 1\nother:\n  b: 2\n");
		expect(catalogs).toEqual({ default: { a: "1" } });
	});
});

describe("addWorkspaceMember", () => {
	it("adds a quoted entry first, in the indent of the list", () => {
		expect(addWorkspaceMember('packages:\n  - "docs"\n', ".")).toEqual({
			content: 'packages:\n  - "."\n  - "docs"\n',
			changed: true,
		});
	});

	it("keeps everything after packages: untouched", () => {
		const result = addWorkspaceMember(YAML, ".");
		expect(result.changed).toBe(true);
		expect(result.content).toBe(YAML.replace("packages:\n", 'packages:\n  - "."\n'));
	});

	it("is idempotent", () => {
		const once = addWorkspaceMember("packages:\n  - docs\n", "apps/web");
		const twice = addWorkspaceMember(once.content, "apps/web");
		expect(twice).toEqual({ content: once.content, changed: false });
	});

	it.each([['packages:\n  - "."\n'], ["packages:\n  - .\n  - docs\n"], ["packages:\n  - ''\n"]])(
		"treats %j as already listing the root",
		(yaml) => {
			expect(addWorkspaceMember(yaml, ".")).toEqual({ content: yaml, changed: false });
		}
	);

	it("does not take an empty entry for another member", () => {
		expect(addWorkspaceMember("packages:\n  - ''\n", "docs").changed).toBe(true);
	});

	it("changes nothing without a packages: key", () => {
		const yaml = "# no workspace packages configured\n";
		expect(addWorkspaceMember(yaml, ".")).toEqual({ content: yaml, changed: false });
	});

	it("handles an empty packages: list and a packages: line with a comment", () => {
		expect(addWorkspaceMember("packages:\n\ncatalog:\n  foo: ^1.0.0\n", ".").content).toBe(
			'packages:\n  - "."\n\ncatalog:\n  foo: ^1.0.0\n'
		);
		expect(addWorkspaceMember("packages: # members\n  - docs\n", ".").changed).toBe(true);
	});
});

describe("gt", () => {
	it("compares x.y.z release versions", () => {
		expect(gt("4.15.0", "3.45.1")).toBe(true);
		expect(gt("8.2.0", "8.2.0")).toBe(false);
		expect(gt("8.1.9", "8.2.0")).toBe(false);
		expect(gt("1.10.0", "1.9.0")).toBe(true);
	});
	it("treats missing version segments as 0", () => {
		expect(gt("4.1", "4")).toBe(true);
		expect(gt("4", "4.0.0")).toBe(false);
		expect(gt("4.0.1", "4.0")).toBe(true);
	});
});

const fakeLatest =
	(table: Record<string, string>): FetchLatest =>
	async (pkg) =>
		table[pkg] ?? null;

describe("bumpCatalogPins", () => {
	const ws = [
		"catalog:",
		"  '@theholocron/cli': ^3.45.0",
		"  chalk: ^6.0.0",
		"catalogs:",
		"  configs:",
		"    '@theholocron/tsconfig': ^7.19.1",
		'    "@theholocron/eslint-config": "~7.24.1"',
	].join("\n");

	it("bumps every pin to latest, keeping the prefix and the quoting", async () => {
		const { content, bumps } = await bumpCatalogPins(
			ws,
			fakeLatest({
				"@theholocron/cli": "4.15.0",
				chalk: "6.1.0",
				"@theholocron/tsconfig": "8.2.0",
				"@theholocron/eslint-config": "8.2.0",
			})
		);
		expect(content).toContain("'@theholocron/cli': ^4.15.0");
		expect(content).toContain("chalk: ^6.1.0");
		expect(content).toContain("'@theholocron/tsconfig': ^8.2.0");
		expect(content).toContain('"@theholocron/eslint-config": "~8.2.0"');
		expect(bumps.map((b) => b.pkg).sort()).toEqual([
			"@theholocron/cli",
			"@theholocron/eslint-config",
			"@theholocron/tsconfig",
			"chalk",
		]);
	});

	it("only looks up the packages `include` accepts", async () => {
		const asked: string[] = [];
		const { content } = await bumpCatalogPins(
			ws,
			async (pkg) => {
				asked.push(pkg);
				return "9.0.0";
			},
			{ include: (pkg) => pkg === "chalk" }
		);
		expect(asked).toEqual(["chalk"]);
		expect(content).toContain("chalk: ^9.0.0");
		expect(content).toContain("'@theholocron/cli': ^3.45.0");
	});

	it("never downgrades, and leaves a package with no answer alone", async () => {
		const { content, bumps } = await bumpCatalogPins(ws, fakeLatest({ "@theholocron/cli": "3.40.0" }));
		expect(content).toBe(ws);
		expect(bumps).toEqual([]);
	});

	it("is a no-op when every pin is already at latest", async () => {
		const { content, bumps } = await bumpCatalogPins(ws, fakeLatest({ "@theholocron/cli": "3.45.0" }));
		expect(content).toBe(ws);
		expect(bumps).toEqual([]);
	});
});
