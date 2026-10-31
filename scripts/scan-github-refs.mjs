#!/usr/bin/env node
/**
 * Counts references to the reusable workflows and composite actions hosted in `theholocron/.github`, across every active
 * repository in the org. It is the exit test for removing the shims in `.github` (spec: tech-workflows-in-holocron,
 * issue #1215): the shims go when the count outside `.github` itself reaches zero.
 *
 * It clones each repository's default branch (shallow) and greps the files, rather than using GitHub code search, which
 * skips repositories that are not indexed and gives no guarantee of completeness.
 *
 * Usage: node scripts/scan-github-refs.mjs [--org theholocron] [--json] [--max <n>]
 *   --org   the GitHub org to scan (default: theholocron)
 *   --json  print the result as JSON instead of a table
 *   --max   exit 1 when the count outside `.github` is greater than <n> (default: report only)
 * Needs: `gh` signed in with read access to the org's repositories, and `git`.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		org: { type: "string", default: "theholocron" },
		json: { type: "boolean", default: false },
		max: { type: "string" },
	},
});

const org = values.org;
const NEEDLE = `${org}/.github/.github/`;
// The repository that hosts the files: its own references are the shims and starters, not callers.
const HOST = ".github";
const SKIP_DIRS = new Set([".git", "node_modules"]);

function run(command, args, options = {}) {
	return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
}

/** Every file under `dir` that is a text file (no NUL bytes in its first KiB). */
function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.isFile() && statSync(path).size < 5 * 1024 * 1024) yield path;
	}
}

/** What a reference points at, from the text after the needle. */
function kind(line) {
	const rest = line.slice(line.indexOf(NEEDLE) + NEEDLE.length);
	if (rest.startsWith("workflows/")) return "workflow";
	if (rest.startsWith("actions/")) return "action";
	return "other";
}

const repos = JSON.parse(run("gh", ["repo", "list", org, "--limit", "200", "--json", "name,isArchived,isTemplate"]))
	.filter((repo) => !repo.isArchived)
	.sort((a, b) => a.name.localeCompare(b.name));

const scratch = mkdtempSync(join(tmpdir(), "scan-github-refs-"));
const found = [];
try {
	for (const repo of repos) {
		const dest = join(scratch, repo.name);
		run("gh", ["repo", "clone", `${org}/${repo.name}`, dest, "--", "--depth", "1", "--quiet"], { stdio: "pipe" });
		for (const file of walk(dest)) {
			const head = readFileSync(file).subarray(0, 1024);
			if (head.includes(0)) continue;
			const lines = readFileSync(file, "utf8").split("\n");
			lines.forEach((line, index) => {
				if (!line.includes(NEEDLE)) return;
				found.push({
					repo: repo.name,
					template: repo.isTemplate,
					file: relative(dest, file),
					line: index + 1,
					kind: kind(line),
					text: line.trim(),
				});
			});
		}
	}
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

const outside = found.filter((ref) => ref.repo !== HOST);
const perRepo = new Map();
for (const ref of found) {
	const row = perRepo.get(ref.repo) ?? { repo: ref.repo, workflow: 0, action: 0, other: 0, files: new Set() };
	row[ref.kind] += 1;
	row.files.add(ref.file);
	perRepo.set(ref.repo, row);
}

if (values.json) {
	console.log(
		JSON.stringify(
			{ org, scanned: repos.map((r) => r.name), total: found.length, outside: outside.length, found },
			null,
			2
		)
	);
} else {
	console.log(`Scanned ${repos.length} repositories in ${org} for "${NEEDLE}"\n`);
	console.log(
		"repo".padEnd(28),
		"files".padStart(6),
		"workflow".padStart(9),
		"action".padStart(7),
		"other".padStart(6)
	);
	for (const repo of repos) {
		const row = perRepo.get(repo.name) ?? { workflow: 0, action: 0, other: 0, files: new Set() };
		const label = repo.name === HOST ? `${repo.name} (host)` : repo.name;
		console.log(
			label.padEnd(28),
			String(row.files.size).padStart(6),
			String(row.workflow).padStart(9),
			String(row.action).padStart(7),
			String(row.other).padStart(6)
		);
	}
	console.log(`\nReferences outside ${HOST}: ${outside.length} (${found.length - outside.length} inside the host)`);
}

if (values.max !== undefined && outside.length > Number(values.max)) {
	console.error(`${outside.length} references outside ${HOST}, more than the allowed ${values.max}`);
	process.exit(1);
}
