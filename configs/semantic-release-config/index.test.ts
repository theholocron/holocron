import { describe, expect, it } from "vitest";

import { commitAnalyzer, defineConfig, releaseNotesGenerator } from "./index.js";

describe("semantic-release-config", () => {
	describe("commitAnalyzer", () => {
		it("is a two-element tuple [plugin-name, options]", () => {
			expect(Array.isArray(commitAnalyzer)).toBe(true);
			expect(commitAnalyzer[0]).toBe("@semantic-release/commit-analyzer");
			expect(typeof commitAnalyzer[1]).toBe("object");
		});

		it("uses conventionalcommits preset", () => {
			const opts = commitAnalyzer[1] as { preset: string };
			expect(opts.preset).toBe("conventionalcommits");
		});
	});

	describe("releaseNotesGenerator", () => {
		it("is a two-element tuple [plugin-name, options]", () => {
			expect(Array.isArray(releaseNotesGenerator)).toBe(true);
			expect(releaseNotesGenerator[0]).toBe("@semantic-release/release-notes-generator");
		});
	});

	describe("defineConfig()", () => {
		it("labels released issues `released` on every branch, not `released on @<channel>`", () => {
			const { plugins } = defineConfig({ branches: ["main", { name: "alpha", prerelease: true }] }) as {
				plugins: unknown[];
			};
			expect(plugins.at(-1)).toEqual(["@semantic-release/github", { releasedLabels: ["released"] }]);
		});

		it("returns an object with branches and plugins", () => {
			const config = defineConfig() as {
				branches: unknown[];
				plugins: unknown[];
			};
			expect(Array.isArray(config.branches)).toBe(true);
			expect(Array.isArray(config.plugins)).toBe(true);
		});

		it("defaults to main branch", () => {
			const config = defineConfig() as { branches: string[] };
			expect(config.branches).toContain("main");
		});

		it("accepts custom branches", () => {
			const config = defineConfig({ branches: ["main", "alpha"] }) as {
				branches: string[];
			};
			expect(config.branches).toContain("alpha");
		});

		it("includes monorepo packages glob in git assets by default", () => {
			const config = defineConfig() as { plugins: unknown[] };
			const git = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/git") as [
				string,
				{ assets: string[] },
			];
			expect(git[1].assets).toContain("packages/*/package.json");
		});

		it("adds @semantic-release/exec before git when exec options are given", () => {
			const exec = { prepareCmd: "pnpm build", publishCmd: "pnpm publish" };
			const config = defineConfig({ exec }) as { plugins: unknown[] };
			const names = config.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
			expect(config.plugins[names.indexOf("@semantic-release/exec")]).toEqual(["@semantic-release/exec", exec]);
			expect(names.indexOf("@semantic-release/exec")).toBeLessThan(names.indexOf("@semantic-release/git"));
		});

		describe("npm option", () => {
			it("inserts @semantic-release/npm with access: public when npm: true", () => {
				const config = defineConfig({ npm: true }) as {
					plugins: unknown[];
				};
				const npm = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/npm") as [
					string,
					{ access: string },
				];
				expect(npm).toBeDefined();
				expect(npm[1].access).toBe("public");
			});

			it("places @semantic-release/npm after changelog and before git", () => {
				const config = defineConfig({ npm: true }) as {
					plugins: unknown[];
				};
				const plugins = config.plugins as unknown[];
				const changelogIdx = plugins.indexOf("@semantic-release/changelog");
				const npmIdx = plugins.findIndex(
					(p) => Array.isArray(p) && (p as unknown[])[0] === "@semantic-release/npm"
				);
				const gitIdx = plugins.findIndex(
					(p) => Array.isArray(p) && (p as unknown[])[0] === "@semantic-release/git"
				);
				expect(npmIdx).toBeGreaterThan(changelogIdx);
				expect(npmIdx).toBeLessThan(gitIdx);
			});

			it("accepts npm options object", () => {
				const config = defineConfig({
					npm: { access: "restricted" },
				}) as {
					plugins: unknown[];
				};
				const npm = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/npm") as [
					string,
					{ access: string },
				];
				expect(npm[1].access).toBe("restricted");
			});

			it("uses single-package assets when npm is set", () => {
				const config = defineConfig({ npm: true }) as {
					plugins: unknown[];
				};
				const git = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/git") as [
					string,
					{ assets: string[] },
				];
				expect(git[1].assets).not.toContain("packages/*/package.json");
				expect(git[1].assets).toContain("package.json");
			});

			it("allows assets override even when npm is set", () => {
				const config = defineConfig({
					npm: true,
					assets: ["CHANGELOG.md", "package.json", "dist/"],
				}) as { plugins: unknown[] };
				const git = config.plugins.find((p) => Array.isArray(p) && p[0] === "@semantic-release/git") as [
					string,
					{ assets: string[] },
				];
				expect(git[1].assets).toContain("dist/");
			});
		});
	});
});
