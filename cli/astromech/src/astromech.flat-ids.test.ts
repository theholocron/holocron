import { describe, expect, it, vi } from "vitest";

import { createAstromech } from "./astromech.js";

const PKG = JSON.stringify({ name: "@scope/x" });

function fs(files: Record<string, string>) {
	const CWD = "/repo";
	const rel = (p: string) => (p === CWD ? "" : p.startsWith(CWD + "/") ? p.slice(CWD.length + 1) : p);
	return {
		cwd: CWD,
		readFile: (p: string) => {
			const c = files[rel(p)];
			if (c === undefined) throw new Error(`ENOENT ${p}`);
			return c;
		},
		fileExists: (p: string) => files[rel(p)] !== undefined,
		listDir: (p: string) => {
			const prefix = rel(p) === "" ? "" : rel(p) + "/";
			return Object.keys(files)
				.filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
				.map((f) => f.slice(prefix.length));
		},
	};
}

describe("createAstromech() with the flat task ids", () => {
	const legacy = [
		{ name: "verification.typeSafety", required: true },
		{ name: "sourceQuality.staticAnalysis", required: true, turbo: { dependsOn: ["@x/config#delivery.build"] } },
		{ name: "sourceQuality.formatting", required: true },
		"sourceQuality.structuredDataValidation",
		{ name: "verification.unitTests", required: true },
		"delivery.build",
		{ name: "delivery.publish", with: { groups: ["a"] } },
		{ name: "knowledge.docs", with: { preview: true } },
		"platform.syncTemplates",
		"stale",
	];
	const flat = [
		{ name: "typecheck", required: true },
		{ name: "lint:code", required: true, turbo: { dependsOn: ["@x/config#build"] } },
		{ name: "lint:editorconfig", required: true },
		"lint:data",
		{ name: "test:unit", required: true },
		"build",
		{ name: "release", with: { groups: ["a"] } },
		{ name: "deploy-docs", with: { preview: true } },
		"sync-templates",
		"mark-stale",
	];

	it("generates the same thin callers, turbo.json and required checks as the old names, so no file changes", () => {
		const old = createAstromech({ cwd: "/repo", config: { tasks: legacy } });
		const next = createAstromech({ cwd: "/repo", config: { tasks: flat } });
		const callers = (a: typeof old) => [...a.thinCallers().entries()].sort(([x], [y]) => x.localeCompare(y));
		expect(callers(next)).toEqual(callers(old));
		expect([...next.thinCallers().keys()]).toContain("verification.unitTests.yml");
		expect(next.turboConfig()).toBe(old.turboConfig());
		expect(next.requiredChecks(false)).toEqual(old.requiredChecks(false));
		expect(next.requiredChecks(true)).toEqual(old.requiredChecks(true));
	});

	it("`format` has no workflow of its own, and a deploy that runs on release has none either", () => {
		const callers = createAstromech({
			cwd: "/repo",
			config: { tasks: ["format", { name: "deploy", with: { on: "release" } }] },
		}).thinCallers();
		expect(callers.size).toBe(0);
	});

	it("lists the runnable tasks under the names the manifest uses", () => {
		const names = (tasks: Array<string | { name: string }>) =>
			createAstromech({ cwd: "/repo", config: { tasks } }).runnableTasks();
		expect(names(["typecheck", "scan:code", "format", "label", "sync-repo"])).toEqual([
			"typecheck",
			"format",
			"sync-repo",
		]);
		expect(names(["sourceQuality.formatting", "delivery.deploy"])).toEqual(["sourceQuality.formatting"]);
	});

	it("writes a `holocron run <name>` script for a flat id, named as the manifest names it", () => {
		const scripts = createAstromech({
			cwd: "/repo",
			config: { tasks: ["test:unit", "deploy-preview"] },
		}).packageScripts();
		expect(scripts["test:unit"]).toBe("holocron run test:unit --");
	});

	it("reports an old task name on stderr by default", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			createAstromech({ ...fs({ "package.json": PKG }), print: () => {}, exec: () => ({ exitCode: 0 }) }).run(
				"delivery.deploy"
			);
			expect(error).toHaveBeenCalledWith('"delivery.deploy" is a deprecated task name: use deploy');
		} finally {
			error.mockRestore();
		}
	});

	it("takes the words of the command line: the task, the job, the further positionals and --check", () => {
		const exec = vi.fn(() => ({ exitCode: 0 }));
		const astromech = createAstromech({
			...fs({ "package.json": PKG, "turbo.json": JSON.stringify({ tasks: { "verification.unitTests": {} } }) }),
			exec,
			print: () => {},
			config: { tasks: ["test:unit"] },
		});
		astromech.run("test", { job: "unit", args: ["storybook"], passthrough: ["--watch"] });
		expect(exec).toHaveBeenCalledWith(
			expect.stringMatching(/turbo$/),
			["run", "verification.unitTests", "--", "--coverage", "storybook", "--watch"],
			{ cwd: "/repo" }
		);
		const dry = createAstromech({
			...fs({ "package.json": PKG }),
			print: () => {},
			config: { tasks: ["format"] },
		}).run("format", { check: true, dryRun: true });
		expect(dry).toMatchObject({ status: "dry-run", command: "prettier --check ." });
	});
});
