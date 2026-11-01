import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { DocsCoverageMode } from "@theholocron/astromech";

import type { PluginProbes, ProbeContext } from "../../../plugin/index.js";
import { addedLines } from "./added-lines.js";
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

/** The diff of the PR's `.ts` files against the base (`BASE_SHA`, or the merge base with `origin/alpha`). */
export function realDiff(repoRoot: string): () => string {
	/* v8 ignore start -- runs the real git; the probe is tested with an injected diff */
	return () => {
		const base = process.env["BASE_SHA"] || "origin/alpha";
		return execFileSync("git", ["diff", "-U0", "--no-color", `${base}...HEAD`, "--", "*.ts"], {
			cwd: repoRoot,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
	};
	/* v8 ignore stop */
}

/** Writes the report `--lcov <path>` asks for, and says so; a dry run only says what it would write. */
function writeLcov(ctx: ProbeContext, repoRoot: string, packages: PackageDocs[]): void {
	if (!ctx.lcov) return;
	if (ctx.dryRun) {
		ctx.say({ status: "info", label: "lcov", detail: `would write ${ctx.lcov}` });
		return;
	}
	const file = resolve(repoRoot, ctx.lcov);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, toLcov(packages));
	ctx.say({ status: "info", label: "lcov", detail: `wrote ${ctx.lcov}` });
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
 * numbers as `coverage/docs.lcov`, for a coverage service to read. `docs patch` fails for each export a PR adds or
 * changes without a doc comment, for a person to run before pushing (in CI the Codecov status gates). `docs coverage`
 * and `docs patch` also write that report wherever `--lcov <path>` says, from the same measurement.
 *
 * `mode` is the repo's `repoValidation.docsCoverage`, and only `docs patch` follows it: `off` skips it (nothing is
 * measured or written), `warn` reports an undocumented export without failing, `required` fails for it.
 */
export function docsCoverageProbes(
	repoRoot: string,
	typedoc: MeasureDocsCoverageInput["typedoc"] = runTypedoc(repoRoot),
	diff: () => string = realDiff(repoRoot),
	mode: DocsCoverageMode = "required"
): PluginProbes {
	const measure = (): PackageDocs[] => measureDocsCoverage({ repoRoot, typedoc });
	return {
		coverage: {
			summary: "Show how much of each package's exported API has a doc comment.",
			writes: false,
			async run(ctx) {
				const packages = measure();
				writeLcov(ctx, repoRoot, packages);
				summarise(ctx, packages);
			},
		},
		patch: {
			summary: "Fail for each export a PR adds or changes that has no doc comment (against BASE_SHA).",
			writes: false,
			async run(ctx) {
				if (mode === "off") {
					ctx.say({
						status: "info",
						label: "docs patch",
						detail: "off in this repo's config (repoValidation.docsCoverage)",
					});
					return;
				}
				const added = addedLines(diff());
				const touched = (dir: string): boolean => [...added.keys()].some((file) => file.startsWith(`${dir}/`));
				// the report covers every package, so `--lcov` measures them all; otherwise only the touched ones
				const packages = measureDocsCoverage({ repoRoot, typedoc, ...(ctx.lcov ? {} : { only: touched }) });
				writeLcov(ctx, repoRoot, packages);
				const missing = packages
					.flatMap(({ symbols }) => symbols)
					.filter((s) => added.get(s.file)?.has(s.line));
				const undocumented = missing.filter((s) => !s.documented);
				ctx.say({ status: "heading", label: "Exports this PR adds or changes" });
				// `warn` reports the same rows but does not fail the run
				const level = mode === "warn" ? "info" : "fail";
				for (const { file, line, kind, name } of undocumented) {
					ctx.say({ status: level, label: `${file}:${line}`, detail: `${kind} ${name} has no doc comment` });
				}
				if (undocumented.length === 0) {
					ctx.say({
						status: "ok",
						label: `${missing.length} checked`,
						detail: "every one has a doc comment",
					});
				} else if (mode === "warn") {
					ctx.say({
						status: "info",
						label: `${undocumented.length} without a doc comment`,
						detail: "warn: not failing (repoValidation.docsCoverage)",
					});
				}
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
