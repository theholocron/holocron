import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { areaLabelsForFiles } from "../../area-labels/index.js";
import { loadConfig } from "../config-system.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const gitExec = async () => "https://github.com/theholocron/holocron.git";

// Folders the spec lists that this checkout may not have (a skills folder for agents is not committed everywhere).
const MAY_BE_ABSENT = [".claude/skills"];

describe("holocron's own area labels (#2430)", () => {
	it("declares the spec's fifteen areas, each scope naming one", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const labels = resolved.repo?.labels;
		expect(Object.keys(labels?.areas ?? {}).sort()).toEqual(
			[
				"ci",
				"cli",
				"clients",
				"comlink",
				"configs",
				"council",
				"docs",
				"observability",
				"plugins",
				"sentinel",
				"skills",
				"specs",
				"themes",
				"tooling",
				"utils",
			].sort()
		);
		for (const area of Object.values(labels?.scopes ?? {})) expect(labels?.areas).toHaveProperty(area);
	});

	it("points every pattern at a folder or file that exists", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		for (const [name, patterns] of Object.entries(resolved.repo?.labels?.areas ?? {})) {
			for (const pattern of patterns.filter((p) => !p.startsWith("!"))) {
				const root = pattern.replace(/\/?\*\*.*$/, "");
				if (MAY_BE_ABSENT.includes(root)) continue;
				expect(existsSync(join(REPO_ROOT, root)), `${name}: ${pattern}`).toBe(true);
			}
		}
	});

	it("maps real paths to the areas the spec table gives", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const areas = resolved.repo?.labels?.areas;
		const of = (file: string) => areaLabelsForFiles([file], areas);
		expect(of("cli/kyber/src/index.ts")).toEqual(["area:cli"]);
		expect(of("cli/cli/README.md")).toEqual(["area:cli"]);
		expect(of("apps/sentinel/src/x.ts")).toEqual(["area:sentinel"]);
		expect(of("plugins/holocron-plugin-turbo/src/x.ts")).toEqual(["area:plugins"]);
		expect(of("docs/src/content/docs/a.mdx")).toEqual(["area:docs"]);
		expect(of("fern/docs.yml")).toEqual(["area:docs"]);
		expect(of("docs/wiki/specifications/a.spec.md")).toEqual(["area:specs"]);
		expect(of(".notes/a.spec.md")).toEqual(["area:specs"]);
		expect(of(".github/workflows/ci.yml")).toEqual(["area:ci"]);
		expect(of(".holocron/repo.ts")).toEqual(["area:tooling"]);
		expect(of("turbo.json")).toEqual(["area:tooling"]);
		expect(of("package.json")).toEqual([]);
		expect(of("scripts/bump-versions.mjs")).toEqual([]);
	});
});
