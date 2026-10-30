import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { ProbeRow } from "../../../plugin/index.js";
import { checkDeps } from "./check-deps.js";
import { depsProbes } from "./deps-probes.js";
import { groupOf } from "./group-of.js";
import { parseCatalogs } from "./parse-catalogs.js";
import { pickRange } from "./pick-range.js";
import { planDeps } from "./plan-deps.js";
import { reportDeps } from "./report-deps.js";
import { targetCatalog } from "./target-catalog.js";
import { workspaceDirs } from "./workspace-dirs.js";

const YAML = `packages:
  - "apps/*"
  - "cli/*"
  - "plugins/*"
  - "solo"
  - "!ignored"
  - "missing/*"

# a comment
catalog:
  "@types/node": ^26
  typescript: ^5.9.3
  tsx: 4.23.15

catalogs:
  # cli: only cli uses these
  cli:
    yargs: ^18.1.0

  peers:
    "@theholocron/widget-client": ^1.2.0

overrides:
  cookie: ^2.0.1
`;

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
});

describe("targetCatalog", () => {
	it("puts a dependency used by two or more groups in the default catalog", () => {
		expect(targetCatalog(new Set(["cli", "plugins"]))).toBe("default");
	});

	it("puts a dependency used by one group in that group's catalog", () => {
		expect(targetCatalog(new Set(["configs"]))).toBe("configs");
	});

	it("keeps root-only tooling global, and counts root plus one group as shared", () => {
		expect(targetCatalog(new Set(["root"]))).toBe("default");
		expect(targetCatalog(new Set(["root", "cli"]))).toBe("default");
	});
});

describe("pickRange", () => {
	it("keeps the preferred range when it is one of them", () => {
		expect(pickRange(["^1.2.0", "^1.3.0"], "^1.2.0").range).toBe("^1.2.0");
	});

	it("otherwise takes the highest minimum version", () => {
		expect(pickRange(["^7.2.2", "^7.3.3", "^7.2.4"]).range).toBe("^7.3.3");
		expect(pickRange(["^1.0", "^2"]).range).toBe("^2");
	});

	it("flags ranges that disagree on the major version", () => {
		expect(pickRange(["^4.1.0", "^5.0.0"]).majorConflict).toBe(true);
		expect(pickRange(["^4.1.0", "^4.2.0"]).majorConflict).toBe(false);
	});

	it("flags a range that is not plain semver", () => {
		expect(pickRange(["latest", "^1.0.0"]).unparsed).toBe(true);
	});
});

describe("groupOf", () => {
	it("is the top-level folder, or root", () => {
		expect(groupOf("")).toBe("root");
		expect(groupOf("cli/cli")).toBe("cli");
	});
});

describe("a workspace on disk", () => {
	const root = mkdtempSync(join(tmpdir(), "deps-probe-"));
	afterAll(() => rmSync(root, { recursive: true }));

	const manifest = (dir: string, json: unknown): void => {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify(json));
	};
	writeFileSync(join(root, "pnpm-workspace.yaml"), YAML);
	manifest("", { name: "root", devDependencies: { typescript: "catalog:" } });
	manifest("cli/cli", {
		name: "@x/cli",
		dependencies: { yargs: "catalog:cli", "@types/node": "catalog:", tsx: "catalog:" },
		devDependencies: { typescript: "catalog:" },
	});
	manifest("plugins/a", {
		name: "@x/plugin-a",
		devDependencies: { "@types/node": "catalog:", "@x/cli": "workspace:*" },
		peerDependencies: { "@theholocron/widget-client": "catalog:peers", vitest: "^4 || ^5" },
	});
	manifest("solo", { name: "@x/solo", dependencies: { tsx: "catalog:" } });
	mkdirSync(join(root, "apps", "no-manifest"), { recursive: true });

	const run = async (probe: "report" | "who" | "check", args: string[] = []) => {
		const out: string[] = [];
		const rows: ProbeRow[] = [];
		const probes = depsProbes(root, (t) => out.push(t));
		await probes[probe]!.run({
			dryRun: false,
			args,
			say: (r) => rows.push(r),
			write: async () => undefined,
			cleanup: () => {},
			secret: () => {},
		});
		return { out: out.join("\n"), rows };
	};

	it("finds the workspace folders from the packages globs", () => {
		expect(workspaceDirs(root, YAML).sort()).toEqual(["", "cli/cli", "plugins/a", "solo"].sort());
	});

	it("accepts a layout that follows the rule", async () => {
		expect(checkDeps(planDeps(root))).toEqual([]);
		const { rows } = await run("check");
		expect(rows).toEqual([{ status: "ok", label: "5 dependencies", detail: "all in the right catalog" }]);
	});

	it("prints the report and the users of one dependency", async () => {
		const report = await run("report");
		expect(report.out).toContain("# Dependencies");
		expect(report.out).toContain("Peer ranges only");
		expect(report.out).toContain("Peer floors");
		expect(report.out).toContain("`yargs`");
		const who = await run("who", ["@types/node"]);
		expect(who.out).toContain("@x/cli (prod)");
		expect(who.out).toContain("@x/plugin-a (dev)");
		expect(who.rows[0]?.status).toBe("ok");
	});

	it("says so for a name that matches nothing, and asks for a name when none is given", async () => {
		expect(reportDeps(planDeps(root), "nope")).toContain('No dependency matches "nope"');
		const none = await run("who");
		expect(none.rows[0]).toMatchObject({ status: "fail" });
		expect(none.out).toBe("");
	});

	it("leaves a peer range alone and lists it as peer-only", () => {
		const vitest = planDeps(root).rows.find((r) => r.name === "vitest");
		expect(vitest?.catalog).toBeNull();
		expect(reportDeps(planDeps(root), "vitest")).toContain("peer ranges only");
	});

	it("reports a hard-coded version, a dependency in the wrong catalog and an unused entry", async () => {
		manifest("cli/cli", {
			name: "@x/cli",
			dependencies: { yargs: "^18.1.0", "@types/node": "catalog:" },
			devDependencies: { typescript: "catalog:cli" },
		});
		const problems = checkDeps(planDeps(root));
		expect(problems.some((p) => p.includes("dependencies.yargs") && p.includes('"^18.1.0"'))).toBe(true);
		expect(problems.some((p) => p.includes("catalog entry") && p.includes('"yargs"'))).toBe(true);
		expect(problems.some((p) => p.includes("typescript") && p.includes("catalog:cli"))).toBe(true);
		const { rows } = await run("check");
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.status === "fail")).toBe(true);
	});

	it("flags a catalog reference with no entry, a major conflict and a non-semver range", () => {
		manifest("cli/cli", {
			name: "@x/cli",
			dependencies: { ghost: "catalog:", yargs: "catalog:cli", "@types/node": "catalog:", tsx: "catalog:" },
			devDependencies: { typescript: "catalog:" },
		});
		manifest("solo", { name: "@x/solo", dependencies: { tsx: "catalog:", other: "^1.0.0" } });
		manifest("plugins/a", {
			name: "@x/plugin-a",
			devDependencies: { "@types/node": "catalog:", other: "latest" },
			peerDependencies: { "@theholocron/widget-client": "catalog:peers" },
		});
		const problems = checkDeps(planDeps(root));
		expect(problems.some((p) => p.includes("ghost") && p.includes("has no catalog entry"))).toBe(true);
		expect(problems.some((p) => p.includes("other") && p.includes("not plain semver"))).toBe(true);
		manifest("plugins/a", {
			name: "@x/plugin-a",
			devDependencies: { "@types/node": "catalog:", other: "^2.0.0" },
			peerDependencies: { "@theholocron/widget-client": "catalog:peers" },
		});
		expect(checkDeps(planDeps(root)).some((p) => p.includes("other: ranges disagree"))).toBe(true);
	});

	it("reports a workspace package that is pinned to a version instead of linked", () => {
		manifest("plugins/b", {
			name: "@x/plugin-b",
			devDependencies: { "@x/cli": "^1.0.0" },
			peerDependencies: { "@x/cli": "^1.0.0" },
		});
		const problems = checkDeps(planDeps(root));
		const pinned = problems.filter((p) => p.includes("@x/cli") && p.includes("workspace package"));
		// the dev dependency is wrong; the peer range is a compatibility range and is fine
		expect(pinned).toHaveLength(1);
		expect(pinned[0]).toContain("devDependencies");
		expect(pinned[0]).toContain('use "workspace:^"');
	});

	it("reports a workspace package that is reached through a catalog", () => {
		manifest("plugins/b", { name: "@x/plugin-b", devDependencies: { "@x/cli": "catalog:cli" } });
		const problems = checkDeps(planDeps(root));
		expect(problems.some((p) => p.includes("devDependencies.@x/cli") && p.includes('use "workspace:^"'))).toBe(
			true
		);
	});

	it("reports a dependency that names the wrong catalog", () => {
		manifest("plugins/b", { name: "@x/plugin-b" });
		manifest("cli/cli", {
			name: "@x/cli",
			dependencies: { yargs: "catalog:cli", "@types/node": "catalog:cli", tsx: "catalog:" },
			devDependencies: { typescript: "catalog:" },
		});
		const problems = checkDeps(planDeps(root));
		expect(problems.some((p) => p.includes("@types/node") && p.includes("belongs in catalog:"))).toBe(true);
	});
});
