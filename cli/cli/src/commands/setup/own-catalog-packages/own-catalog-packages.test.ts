import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ownCatalogPackages } from "./own-catalog-packages.js";

describe("ownCatalogPackages", () => {
	const root = mkdtempSync(join(tmpdir(), "own-catalog-"));
	afterAll(() => rmSync(root, { recursive: true }));

	const pkg = (dir: string, name: string): void => {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name }));
	};

	it("is empty without a pnpm-workspace.yaml", () => {
		expect(ownCatalogPackages(root)).toEqual([]);
	});

	it("lists the workspace packages that a catalog also lists, sorted, and nothing else", () => {
		pkg("clients/b-client", "@x/b-client");
		pkg("clients/a-client", "@x/a-client");
		pkg("clients/not-in-a-catalog", "@x/not-in-a-catalog");
		writeFileSync(
			join(root, "pnpm-workspace.yaml"),
			[
				"packages:",
				'  - "clients/*"',
				"",
				"catalog:",
				"  typescript: ^5.9.3",
				'  "@x/b-client": ^1.1.0',
				"",
				"catalogs:",
				"  peers:",
				'    "@x/a-client": ^1.0.0',
				'    "@x/b-client": ^1.0.0',
				"  apps:",
				'    "@x/outside-the-repo": ^8.8.2',
				"",
			].join("\n")
		);
		expect(ownCatalogPackages(root)).toEqual(["@x/a-client", "@x/b-client"]);
	});

	it("does not list a package without a name", () => {
		mkdirSync(join(root, "clients", "nameless"), { recursive: true });
		writeFileSync(join(root, "clients", "nameless", "package.json"), JSON.stringify({ version: "1.0.0" }));
		expect(ownCatalogPackages(root)).toEqual(["@x/a-client", "@x/b-client"]);
	});
});
