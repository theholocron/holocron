import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { check, parseCatalogs, pickRange, plan, report, targetCatalog, workspaceDirs } from "./deps-report.mjs";

const YAML = `packages:
  - "apps/*"
  - "cli/*"
  - "plugins/*"
  - "solo"

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
		assert.deepEqual(catalogs.default, { "@types/node": "^26", typescript: "^5.9.3", tsx: "4.23.15" });
		assert.deepEqual(catalogs.cli, { yargs: "^18.1.0" });
		assert.deepEqual(catalogs.peers, { "@theholocron/widget-client": "^1.2.0" });
	});

	it("stops at the next top-level key", () => {
		assert.equal(parseCatalogs(YAML).default.cookie, undefined);
	});
});

describe("targetCatalog", () => {
	it("puts a dependency used by two or more groups in the default catalog", () => {
		assert.equal(targetCatalog(new Set(["cli", "plugins"])), "default");
	});

	it("puts a dependency used by one group in that group's catalog", () => {
		assert.equal(targetCatalog(new Set(["configs"])), "configs");
	});

	it("keeps root-only tooling global, and counts root plus one group as shared", () => {
		assert.equal(targetCatalog(new Set(["root"])), "default");
		assert.equal(targetCatalog(new Set(["root", "cli"])), "default");
	});
});

describe("pickRange", () => {
	it("keeps the preferred range when it is one of them", () => {
		assert.equal(pickRange(["^1.2.0", "^1.3.0"], "^1.2.0").range, "^1.2.0");
	});

	it("otherwise takes the highest minimum version", () => {
		assert.equal(pickRange(["^7.2.2", "^7.3.3", "^7.2.4"]).range, "^7.3.3");
	});

	it("flags ranges that disagree on the major version", () => {
		assert.equal(pickRange(["^4.1.0", "^5.0.0"]).majorConflict, true);
		assert.equal(pickRange(["^4.1.0", "^4.2.0"]).majorConflict, false);
	});

	it("flags a range that is not plain semver", () => {
		assert.equal(pickRange(["latest", "^1.0.0"]).unparsed, true);
	});
});

describe("a workspace on disk", () => {
	const root = mkdtempSync(join(tmpdir(), "deps-report-"));
	after(() => rmSync(root, { recursive: true }));

	const manifest = (dir, json) => {
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

	it("finds the workspace folders from the packages globs", () => {
		assert.deepEqual(workspaceDirs(root, YAML).sort(), ["", "cli/cli", "plugins/a", "solo"].sort());
	});

	it("accepts a layout that follows the rule", () => {
		const problems = check(plan(root));
		assert.deepEqual(problems, []);
	});

	it("reports a hard-coded version, a dependency in the wrong catalog and an unused entry", () => {
		manifest("cli/cli", {
			name: "@x/cli",
			dependencies: { yargs: "^18.1.0", "@types/node": "catalog:" },
			devDependencies: { typescript: "catalog:cli" },
		});
		const problems = check(plan(root));
		assert.ok(
			problems.some((p) => p.includes("dependencies.yargs") && p.includes('"^18.1.0"')),
			problems.join("\n")
		);
		assert.ok(
			problems.some((p) => p.includes("catalog entry") && p.includes('"yargs"')),
			problems.join("\n")
		);
		assert.ok(
			problems.some((p) => p.includes("typescript") && p.includes("catalog:cli")),
			problems.join("\n")
		);
	});

	it("leaves a peer range alone and lists it as peer-only", () => {
		const p = plan(root);
		const vitest = p.rows.find((r) => r.name === "vitest");
		assert.equal(vitest.catalog, null);
		assert.ok(report(p).includes("Peer ranges only"));
	});

	it("shows every user of one dependency with --who", () => {
		const text = report(plan(root), "@types/node");
		assert.ok(text.includes("@x/cli (prod)"), text);
		assert.ok(text.includes("@x/plugin-a (dev)"));
	});

	it("reports a workspace package that is pinned to a version instead of linked", () => {
		manifest("plugins/b", {
			name: "@x/plugin-b",
			devDependencies: { "@x/cli": "^1.0.0" },
			peerDependencies: { "@x/cli": "^1.0.0" },
		});
		const problems = check(plan(root));
		const pinned = problems.filter((p) => p.includes("@x/cli") && p.includes("workspace package"));
		// the dev dependency is wrong; the peer range is a compatibility range and is fine
		assert.equal(pinned.length, 1, problems.join("\n"));
		assert.ok(pinned[0].includes("devDependencies"));
		assert.ok(pinned[0].includes('use "workspace:^"'));
	});
});
