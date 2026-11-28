import { dependencyNames, readPackageJsonSync } from "@theholocron/pkg-utils";

import type { LocalRunner } from "../../../registry/index.js";

const mkRunner = (tool: string, args: string[] = []): { tool: string; args: string[] } => ({ tool, args });

/**
 * Resolve `{ tool, args }` for a runner, applying `detect[]` against repo
 * files, falling back (#750) to each candidate's `tool` name against
 * `package.json`'s own declared dependencies when neither matches by
 * filename. Only called for `tool` / `detect` runners — the caller handles
 * `command` runners itself, so `local.detect` is present whenever
 * `local.tool` is not.
 *
 * The dependency fallback matters once a Bucket A migration (#680) deletes
 * a build tool's own config file (`tsdown.config.ts`, `vite.config.ts`, …):
 * that file was the *only* signal `detect[]` had to offer, so removing it
 * used to make `delivery.build` report "no task for this repo" and silently
 * skip the build, even though the tool is still very much in use — a
 * package can't actually build with `tsdown` without it in
 * `dependencies`/`devDependencies`, so that's a signal at least as reliable
 * as the config file, and one deleting the file doesn't remove.
 *
 * **Per-candidate, not two full passes** (#750 follow-up — the first
 * shipped version got this wrong): `delivery.build`'s own `detect[]` ends
 * with `{ when: /^tsconfig\.json$/, tool: "tsc" }` as its last-resort
 * fallback, and `tsconfig.json` exists in essentially every package
 * regardless of build tool. A "check every candidate's filename, *then*
 * check every candidate's dependency" two-pass design would let that
 * always-present fallback file win over a real `tsdown`/`vite`/`rollup`
 * dependency match, the moment the earlier candidates' own config files are
 * gone — exactly backwards. Checking `(file match) || (dependency match)`
 * together for each candidate before moving to the next preserves the
 * intended precedence: a real signal for an *earlier* candidate, by either
 * means, still wins over a later candidate's mere filename presence.
 */
export function resolveRunner(
	local: LocalRunner,
	cwd: string,
	listDir: (p: string) => string[],
	readFile: (p: string) => string
): { tool: string; args: string[] } | undefined {
	if (local.tool) return mkRunner(local.tool, local.args);

	let files: string[];
	try {
		files = listDir(cwd);
	} catch {
		files = [];
	}
	const deps = dependencyNames(readPackageJsonSync(cwd, { readFile }));
	for (const candidate of local.detect!) {
		if (files.some((f) => candidate.when.test(f)) || deps.has(candidate.tool)) {
			return mkRunner(candidate.tool, candidate.args);
		}
	}
	return undefined;
}
