import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	bumpCatalogs,
	type FetchLatest,
	fetchLatestFromNpm,
	gt,
	isLegacyConfig,
	migrateConfig,
	runUpgradeDeps,
} from "./upgrade-deps.js";

const fakeLatest =
	(map: Record<string, string>): FetchLatest =>
	(pkg) =>
		Promise.resolve(map[pkg] ?? null);

describe("fetchLatestFromNpm", () => {
	it("returns the latest dist-tag", async () => {
		const spy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ "dist-tags": { latest: "4.15.0" } }), { status: 200 }));
		await expect(fetchLatestFromNpm("@theholocron/cli")).resolves.toBe("4.15.0");
		spy.mockRestore();
	});
	it("returns null on a non-OK response or a network error", async () => {
		const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
		await expect(fetchLatestFromNpm("@theholocron/missing")).resolves.toBeNull();
		spy.mockRejectedValueOnce(new Error("offline"));
		await expect(fetchLatestFromNpm("@theholocron/cli")).resolves.toBeNull();
		spy.mockRestore();
	});

	it("returns null when the payload has dist-tags but no `latest`", async () => {
		const spy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ "dist-tags": { next: "5.0.0" } }), { status: 200 }));
		await expect(fetchLatestFromNpm("@theholocron/cli")).resolves.toBeNull();
		spy.mockRestore();
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

describe("bumpCatalogs", () => {
	const ws = [
		"catalog:",
		"  '@theholocron/cli': ^3.45.0",
		"  chalk: ^6.0.0",
		"catalogs:",
		"  configs:",
		"    '@theholocron/tsconfig': ^7.19.1",
		'    "@theholocron/eslint-config": "~7.24.1"',
		"  holocron:",
		"    '@theholocron/holocron-plugin-github': ^3.45.0",
	].join("\n");

	it("bumps every @theholocron/* pin to latest, keeping the prefix", async () => {
		const { content, bumps } = await bumpCatalogs(
			ws,
			fakeLatest({
				"@theholocron/cli": "4.15.0",
				"@theholocron/tsconfig": "8.2.0",
				"@theholocron/eslint-config": "8.2.0",
				"@theholocron/holocron-plugin-github": "4.15.0",
			})
		);
		expect(content).toContain("'@theholocron/cli': ^4.15.0");
		expect(content).toContain("'@theholocron/tsconfig': ^8.2.0");
		expect(content).toContain('"@theholocron/eslint-config": "~8.2.0"');
		expect(content).toContain("'@theholocron/holocron-plugin-github': ^4.15.0");
		expect(content).toContain("chalk: ^6.0.0"); // untouched
		expect(bumps.map((b) => b.pkg).sort()).toEqual([
			"@theholocron/cli",
			"@theholocron/eslint-config",
			"@theholocron/holocron-plugin-github",
			"@theholocron/tsconfig",
		]);
	});

	it("never downgrades and skips packages with no registry answer", async () => {
		const { content, bumps } = await bumpCatalogs(ws, fakeLatest({ "@theholocron/cli": "3.40.0" /* older */ }));
		expect(content).toBe(ws);
		expect(bumps).toEqual([]);
	});

	it("is a no-op when every pin is already at latest", async () => {
		const { content, bumps } = await bumpCatalogs(
			ws,
			fakeLatest({
				"@theholocron/cli": "3.45.0",
				"@theholocron/tsconfig": "7.19.1",
				"@theholocron/eslint-config": "7.24.1",
				"@theholocron/holocron-plugin-github": "3.45.0",
			})
		);
		expect(content).toBe(ws);
		expect(bumps).toEqual([]);
	});
});

describe("isLegacyConfig", () => {
	it("detects the 7.x preset shape", () => {
		expect(isLegacyConfig("const { repo, workflows, providers } = nodeDocs();")).toBe(true);
		expect(isLegacyConfig("requiredChecks: [...repo.requiredChecks, 'x']")).toBe(true);
		expect(isLegacyConfig("\tworkflows: [...workflows, 'sync'],")).toBe(true);
	});
	it("passes an already-migrated config", () => {
		expect(isLegacyConfig("const preset = nodeDocs();\n\t...preset,\n\ttasks: [...preset.tasks],")).toBe(false);
	});
});

describe("migrateConfig", () => {
	const legacy = `import { defineConfig } from "@theholocron/cli";
import { compose, nodeDocs, wikiCapability as wiki } from "@theholocron/holocron-config";

const { repo, workflows, providers, org, domain, docs } = compose(nodeDocs(), wiki());
export default defineConfig({
	description: "x",
	homepage: "https://docs.theholocron.dev/x/",
	org,
	domain,
	docs,
	repo: {
		...repo,
		requiredChecks: [
			...repo.requiredChecks,
			"audit / Audit the bundle size",
			"codecov/patch/x",
		],
		teams: [{ slug: "gatekeepers", permission: "maintain" }],
		properties: { ...repo.properties, uses_external_packages: false },
	},
	workflows: [...workflows, "audit", { name: "release", with: { "run-build": true } }, "sync"],
	providers: { ...providers, secrets: "github" },
});
`;

	it("applies every mechanical transform", () => {
		const m = migrateConfig(legacy);
		expect(m.changed).toBe(true);
		expect(m.content).toContain("const preset = compose(nodeDocs(), wiki());");
		expect(m.content).toMatch(/defineConfig\(\{\s*\n\t\.\.\.preset,/);
		expect(m.content).not.toMatch(/^\torg,$/m);
		expect(m.content).not.toMatch(/^\tdocs,$/m);
		expect(m.content).toContain("...preset.repo");
		expect(m.content).toContain("...preset.repo?.properties");
		expect(m.content).toContain("...preset.providers");
		expect(m.content).toContain("tasks: [...preset.tasks,");
		expect(m.content).not.toContain("...repo.requiredChecks");
		expect(m.content).toContain("extraRequiredChecks: [");
		expect(m.content).toContain('"audit / Audit the bundle size"');
		expect(m.content).toContain('"codecov/patch/x"');
		expect(m.warnings.length).toBeGreaterThan(0);
	});

	it("is a no-op on an already-migrated config", () => {
		const modern =
			"const preset = nodeDocs();\nexport default defineConfig({ ...preset, tasks: [...preset.tasks] });";
		const m = migrateConfig(modern);
		expect(m.changed).toBe(false);
		expect(m.content).toBe(modern);
	});

	it("just drops `...repo.requiredChecks` when there are no custom entries", () => {
		const src = `const { repo } = nodeDocs();
export default defineConfig({
	repo: {
		...repo,
		requiredChecks: [
			...repo.requiredChecks,
		],
	},
});
`;
		const m = migrateConfig(src);
		expect(m.content).not.toContain("requiredChecks");
		expect(m.content).not.toContain("extraRequiredChecks");
		expect(m.transforms).toContain("dropped `...repo.requiredChecks`");
	});

	it("migrates a legacy `workflows:` with no `repo` block and no re-spread needed", () => {
		// already has `const preset` + `...preset`, only the `workflows:` key is legacy
		const src = `const preset = nodeDocs();
export default defineConfig({
	...preset,
	description: "x",
	workflows: [...workflows, "sync"],
});
`;
		const m = migrateConfig(src);
		expect(m.changed).toBe(true);
		expect(m.content).toContain('tasks: [...preset.tasks, "sync"]');
		expect(m.content).not.toContain("...repo"); // there was none
		// `...preset` was already there — not injected twice
		expect(m.content.match(/\.\.\.preset,/g)).toHaveLength(1);
	});
});

describe("runUpgradeDeps", () => {
	const files = (over: Record<string, string>) => {
		const store: Record<string, string> = { ...over };
		return {
			store,
			readFile: (p: string) => {
				const key = Object.keys(store).find((k) => p.endsWith(k));
				if (key) return store[key]!;
				throw new Error("ENOENT");
			},
			writeFile: (p: string, c: string) => {
				const key = Object.keys(store).find((k) => p.endsWith(k)) ?? p.split("/").pop()!;
				store[key] = c;
			},
		};
	};

	it("accepts an injected logger and defaults cwd to process.cwd()", async () => {
		// no `cwd` — the injected fake fs still matches on basename, so this
		// exercises the `input.cwd ?? process.cwd()` fallback harmlessly.
		const f = files({ "pnpm-workspace.yaml": "catalog:\n  '@theholocron/cli': ^3.45.0\n" });
		const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
		logger.child.mockReturnValue(logger);
		await runUpgradeDeps({
			pinsOnly: true,
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: fakeLatest({ "@theholocron/cli": "4.15.0" }),
			print: () => {},
			logger: logger as never,
		});
		expect(logger.info).toHaveBeenCalledWith(expect.anything(), "upgrade deps: start");
		expect(logger.info).toHaveBeenCalledWith(expect.anything(), "upgrade deps: done");
	});

	it("bumps pins + migrates the config and reports next steps", async () => {
		const f = files({
			"pnpm-workspace.yaml": "catalog:\n  '@theholocron/cli': ^3.45.0\n",
			"holocron.config.ts":
				"const { repo } = nodeDocs();\nexport default defineConfig({\n\tworkflows: [...workflows],\n\trepo: { ...repo },\n});\n",
		});
		const lines: string[] = [];
		const report = await runUpgradeDeps({
			cwd: "/repo",
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: fakeLatest({ "@theholocron/cli": "4.15.0" }),
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("ok");
		expect(report.bumps).toHaveLength(1);
		expect(report.configMigrated).toBe(true);
		expect(f.store["pnpm-workspace.yaml"]).toContain("^4.15.0");
		expect(f.store["holocron.config.ts"]).toContain("const preset =");
		expect(lines.join("\n")).toContain("holocron ci");
	});

	it("dry-run writes nothing", async () => {
		const f = files({ "pnpm-workspace.yaml": "catalog:\n  '@theholocron/cli': ^3.45.0\n" });
		const report = await runUpgradeDeps({
			cwd: "/repo",
			dryRun: true,
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: fakeLatest({ "@theholocron/cli": "4.15.0" }),
			print: () => {},
		});
		expect(report.status).toBe("dry-run");
		expect(f.store["pnpm-workspace.yaml"]).toContain("^3.45.0"); // untouched
	});

	it("--pins-only leaves the config alone", async () => {
		const f = files({
			"pnpm-workspace.yaml": "catalog:\n  '@theholocron/cli': ^3.45.0\n",
			"holocron.config.ts": "const { repo } = nodeDocs();\n",
		});
		const report = await runUpgradeDeps({
			cwd: "/repo",
			pinsOnly: true,
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: fakeLatest({ "@theholocron/cli": "4.15.0" }),
			print: () => {},
		});
		expect(report.configMigrated).toBe(false);
		expect(f.store["holocron.config.ts"]).toBe("const { repo } = nodeDocs();\n");
	});

	it("reports 'already on the current preset API' and 'nothing to do' when nothing changes", async () => {
		const f = files({
			"pnpm-workspace.yaml": "catalog:\n  '@theholocron/cli': ^4.15.0\n",
			"holocron.config.ts": "const preset = nodeDocs();\nexport default defineConfig({ ...preset });\n",
		});
		const lines: string[] = [];
		const report = await runUpgradeDeps({
			cwd: "/repo",
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: fakeLatest({ "@theholocron/cli": "4.15.0" }),
			print: (l) => lines.push(l),
		});
		expect(report.bumps).toHaveLength(0);
		expect(report.configMigrated).toBe(false);
		const out = lines.join("\n");
		expect(out).toContain("already on the current preset API");
		expect(out).toContain("Nothing to do");
	});

	it("handles a repo with no pnpm-workspace.yaml", async () => {
		const f = files({});
		const report = await runUpgradeDeps({
			cwd: "/repo",
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: vi.fn(),
			print: () => {},
		});
		expect(report.status).toBe("ok");
		expect(report.bumps).toHaveLength(0);
	});

	it("pluralises the pin count and marks a dry-run migration with ~", async () => {
		const f = files({
			"pnpm-workspace.yaml": "catalog:\n  '@theholocron/cli': ^3.0.0\n  '@theholocron/holocron-config': ^7.0.0\n",
			"holocron.config.ts":
				"const { repo } = nodeDocs();\nexport default defineConfig({\n\trepo: { ...repo },\n\tworkflows: [...workflows],\n});\n",
		});
		const lines: string[] = [];
		const report = await runUpgradeDeps({
			cwd: "/repo",
			dryRun: true,
			readFile: f.readFile,
			writeFile: f.writeFile,
			fetchLatest: fakeLatest({ "@theholocron/cli": "4.15.0", "@theholocron/holocron-config": "8.2.0" }),
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("dry-run");
		expect(report.bumps).toHaveLength(2);
		const out = lines.join("\n");
		expect(out).toContain("2 pins");
		expect(out).toContain("would migrate");
		expect(out).toContain("~ `workflows:`");
		expect(out).toContain("⚠");
		expect(out).toContain("run without --dry-run");
		// dry-run wrote nothing
		expect(f.store["pnpm-workspace.yaml"]).toContain("^3.0.0");
	});

	describe("with the real filesystem + default helpers", () => {
		let dir: string;
		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), "upgrade-deps-"));
		});
		afterEach(() => rmSync(dir, { recursive: true, force: true }));

		it("uses default readFile / writeFile / print / logger and writes both files", async () => {
			const { writeFileSync } = await import("node:fs");
			writeFileSync(join(dir, "pnpm-workspace.yaml"), "catalog:\n  '@theholocron/cli': ^3.0.0\n");
			writeFileSync(
				join(dir, "holocron.config.ts"),
				"const { repo } = nodeDocs();\nexport default defineConfig({\n\trepo: { ...repo },\n});\n"
			);
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValue(
					new Response(JSON.stringify({ "dist-tags": { latest: "4.15.0" } }), { status: 200 })
				);
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

			const report = await runUpgradeDeps({ cwd: dir });

			expect(report.status).toBe("ok");
			expect(report.bumps).toHaveLength(1);
			const { readFileSync } = await import("node:fs");
			expect(readFileSync(join(dir, "pnpm-workspace.yaml"), "utf8")).toContain("^4.15.0");
			expect(readFileSync(join(dir, "holocron.config.ts"), "utf8")).toContain("const preset =");
			fetchSpy.mockRestore();
			logSpy.mockRestore();
		});

		it("reports nothing to do for an empty directory (default helpers)", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const report = await runUpgradeDeps({ cwd: dir });
			expect(report.status).toBe("ok");
			expect(report.bumps).toHaveLength(0);
			expect(report.configMigrated).toBe(false);
			logSpy.mockRestore();
		});
	});
});
