/**
 * What the rest of Holocron reads from the workspace about Codecov: the packages, their flag names and the upload list.
 * The `codecov.yml` file itself is written by the `coverage` provider (`Coverage.configFiles()`, #2238 step 3), because
 * astromech imports no plugin; this module keeps only what other code needs (the uploads, the coverage expectations,
 * the status contexts).
 */

import { discoverWorkspacePackages } from "@theholocron/pkg-utils";

import type { WorkspacePackage } from "./codecov.type.js";

/** The Codecov flag the Docs coverage workflow uploads doc-comment coverage as (`holocron probe docs --lcov`). */
export const DOCUMENTATION_FLAG = "documentation";

/** Where a package lives, relative to the repo root: its `path`, else `<dir>/<slug>` (`dir` defaults to `packages`). */
export function packageLocation({ slug, dir, path }: WorkspacePackage): string {
	return path ?? `${dir ?? "packages"}/${slug}`;
}

/** Folders that never get a flag: `docs` coverage must not count toward the aggregate statuses. */
const FLAGLESS_FOLDERS = new Set(["docs"]);

/**
 * One Codecov flag per workspace package (its slug, the same name as its
 * component), in package order, without `docs`. A flag per package, not per
 * group folder: Codecov carries a flag forward whole or not at all, so a run that
 * tests one package of a group would otherwise drop the group's other packages.
 */
export function codecovFlagNames(packages: WorkspacePackage[]): string[] {
	return packages.filter((pkg) => !FLAGLESS_FOLDERS.has(packageLocation(pkg).split("/")[0])).map((pkg) => pkg.slug);
}

/**
 * The `uploads` input of the `verification.unitTests` workflow: a JSON list of `{ flag, files }`, one per package
 * that has a flag. `files` is where the package writes its lcov report (`<location>/coverage/lcov.info`), unless
 * `lcovPaths` names another for that slug (a package whose test runner writes it elsewhere).
 */
export function codecovUploads(packages: WorkspacePackage[], lcovPaths: Record<string, string> = {}): string {
	const flags = new Set(codecovFlagNames(packages));
	const entries = packages
		.filter((pkg) => flags.has(pkg.slug))
		.map((pkg) => ({ flag: pkg.slug, files: lcovPaths[pkg.slug] ?? `${packageLocation(pkg)}/coverage/lcov.info` }));
	return JSON.stringify(entries);
}

/**
 * Every package the repo's `pnpm-workspace.yaml` declares (the default roots
 * when it declares none), sorted by location, so each group folder (`cli/`, `plugins/`, ...) stays together. Every one needs a
 * codecov component so `codecov/patch/<slug>` actually posts for each. A
 * package at `<root>/<slug>` carries `dir: <root>`; one that is itself a
 * workspace folder (`observability`) or sits deeper (`docs/theme`) carries its
 * `path`. Two packages with the same folder name are told apart by their full
 * path (`docs-theme`). `[]` when there are none.
 */
export function readWorkspacePackages(repoRoot: string): WorkspacePackage[] {
	const found = discoverWorkspacePackages(repoRoot).flatMap(({ name, relativeDir }) => {
		return name ? [{ name, relativeDir, folder: relativeDir.split("/").at(-1)! }] : [];
	});
	const taken = new Map<string, number>();
	for (const { folder } of found) taken.set(folder, (taken.get(folder) ?? 0) + 1);

	return found
		.map(({ name, relativeDir, folder }): WorkspacePackage => {
			const slug = taken.get(folder)! > 1 ? relativeDir.replaceAll("/", "-") : folder;
			const segments = relativeDir.split("/");
			if (segments.length === 2 && slug === folder) return { slug, name, dir: segments[0] };
			return { slug, name, path: relativeDir };
		})
		.sort((a, b) => packageLocation(a).localeCompare(packageLocation(b)));
}
