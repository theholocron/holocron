import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { PluginProbes, ProbeContext } from "../../../plugin/index.js";
import type { MeasureDocsCoverageInput, PackageDocs } from "./docs-coverage.type.js";
import { measureDocsCoverage } from "./measure-docs-coverage.js";
import { toLcov } from "./to-lcov.js";

/** The group of probes that report how much of the public API carries doc comments. */
export const DOCS_PROVIDER = "docs";

/** Runs the repo's own TypeDoc on one entry point and reads its JSON model. */
export function runTypedoc(repoRoot: string): MeasureDocsCoverageInput["typedoc"] {
	/* v8 ignore start -- spawns the real TypeDoc; the probes are tested with an injected one */
	return (entry, tsconfig) => {
		const bin = join(
			dirname(createRequire(join(repoRoot, "package.json")).resolve("typedoc/package.json")),
			"bin/typedoc"
		);
		const out = join(mkdtempSync(join(tmpdir(), "docs-coverage-")), "model.json");
		execFileSync(
			process.execPath,
			[
				bin,
				...["--entryPoints", entry, "--json", out, "--basePath", repoRoot, "--skipErrorChecking"],
				...["--logLevel", "None", "--excludeExternals", "--exclude", "**/*.test.ts"],
				...(tsconfig ? ["--tsconfig", tsconfig] : []),
			],
			{ cwd: repoRoot, stdio: "pipe" }
		);
		return JSON.parse(readFileSync(out, "utf8")) as ReturnType<MeasureDocsCoverageInput["typedoc"]>;
	};
	/* v8 ignore stop */
}

function percent(documented: number, total: number): string {
	return `${total === 0 ? 100 : Math.round((100 * documented) / total)}%`;
}

function summarise(ctx: ProbeContext, packages: PackageDocs[]): void {
	let total = 0;
	let documented = 0;
	ctx.say({ status: "heading", label: "Documented exports" });
	for (const { dir, symbols } of packages) {
		const done = symbols.filter((s) => s.documented).length;
		total += symbols.length;
		documented += done;
		ctx.say({ status: "info", label: dir, detail: `${done}/${symbols.length} (${percent(done, symbols.length)})` });
	}
	ctx.say({
		status: documented === total ? "ok" : "info",
		label: "total",
		detail: `${documented}/${total} (${percent(documented, total)})`,
	});
}

/**
 * `docs coverage`: how much of each public package's exported API has a doc comment (functions, classes, interfaces,
 * types, constants and their public members), measured with the repo's TypeDoc. `docs lcov` writes the same
 * numbers as `coverage/docs.lcov`, for a coverage service to read.
 */
export function docsCoverageProbes(
	repoRoot: string,
	typedoc: MeasureDocsCoverageInput["typedoc"] = runTypedoc(repoRoot)
): PluginProbes {
	const measure = (): PackageDocs[] => measureDocsCoverage({ repoRoot, typedoc });
	return {
		coverage: {
			summary: "Show how much of each package's exported API has a doc comment.",
			writes: false,
			async run(ctx) {
				summarise(ctx, measure());
			},
		},
		lcov: {
			summary: "Write coverage/docs.lcov: the doc-comment coverage as an lcov report.",
			writes: true,
			async run(ctx) {
				const packages = measure();
				const file = join(repoRoot, "coverage", "docs.lcov");
				await ctx.write(`write ${file}`, async () => {
					mkdirSync(dirname(file), { recursive: true });
					writeFileSync(file, toLcov(packages));
				});
				summarise(ctx, packages);
			},
		},
	};
}
