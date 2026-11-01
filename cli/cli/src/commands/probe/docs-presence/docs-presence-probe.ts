import type { Probe } from "../../../plugin/index.js";
import type { DocsPresenceIo } from "./docs-presence.type.js";
import { evaluateDocsPresence } from "./evaluate-docs-presence.js";
import { isAddedDocComment } from "./is-added-doc-comment.js";
import { isFeat } from "./is-feat.js";
import { packageOf } from "./package-of.js";
import { parseSkipDocs } from "./parse-skip-docs.js";

/** The public packages a PR added, by folder name: an added `<package>/src/index.ts` whose `package.json` is not private. */
function newPublicPackages(addedFiles: readonly string[], io: DocsPresenceIo): string[] {
	return addedFiles.flatMap((file) => {
		const dir = /^(.+)\/src\/index\.ts$/.exec(file)?.[1];
		if (!dir || dir.includes("node_modules")) return [];
		const pkg = io.readPackage(dir);
		return pkg && !pkg.private ? [dir.slice(dir.lastIndexOf("/") + 1)] : [];
	});
}

/**
 * `docs presence`: warns, and never fails, when a PR ships a feature without touching the docs. It warns for a new
 * public package with no docs change at all, and for a `feat` that changes a public package's source (`src/**` or a
 * root `index`) with no docs signal for that package: its README, a docs page named after it, or a doc comment added
 * in its source. `[skip docs] <reason>` in the PR description (`PR_BODY`) or a commit message excuses it, scoped with
 * `[skip docs: <package>]`; a marker with no reason excuses nothing. This is the `docsEnforcement` job of
 * `platform.repoValidation`. The base to diff against is `BASE_SHA` (default `HEAD~1`).
 */
export function docsPresenceProbe(io: DocsPresenceIo): Probe {
	return {
		summary: "Warn when a new package, or a feat to one, ships without a docs change (never fails).",
		writes: false,
		async run(ctx) {
			const base = io.env["BASE_SHA"] || "HEAD~1";
			let addedFiles: string[];
			let changedFiles: string[];
			try {
				addedFiles = io.addedFiles(base);
				changedFiles = io.changedFiles(base);
			} catch {
				ctx.say({
					status: "info",
					label: "docs presence",
					detail: "could not determine the changed files; skipped",
				});
				return;
			}
			ctx.say({ status: "heading", label: "Docs presence" });

			const newPackages = newPublicPackages(addedFiles, io);
			if (newPackages.length === 0) {
				ctx.say({ status: "ok", label: "new packages", detail: "no new public packages" });
			} else if (changedFiles.some((f) => f.startsWith("docs/") || /\.mdx?$/.test(f))) {
				ctx.say({
					status: "ok",
					label: "new packages",
					detail: `${newPackages.join(", ")}: a docs change is in the PR`,
				});
			} else {
				ctx.say({
					status: "info",
					label: "new packages without docs",
					detail: `${newPackages.join(", ")}: add a docs page under docs/ in this PR, or a scoped follow-up right after`,
				});
			}

			const subjects = [io.env["PR_TITLE"] ?? "", ...io.subjects(base)].filter(Boolean);
			if (!isFeat(subjects)) {
				ctx.say({ status: "ok", label: "feature docs", detail: "no feat in this PR; nothing to check" });
				return;
			}
			const packages = [...new Set(changedFiles.flatMap((f) => packageOf(f, io.readPackage) ?? []))];
			if (packages.length === 0) {
				ctx.say({
					status: "ok",
					label: "feature docs",
					detail: "a feat, but no public package source changed",
				});
				return;
			}
			const { warn, skipped, missingReason } = evaluateDocsPresence({
				packages,
				changedFiles,
				addedCommentLines: (dir) => io.diffOf(base, dir).split("\n").filter(isAddedDocComment),
				skip: parseSkipDocs(`${io.env["PR_BODY"] ?? ""}\n${io.messages(base)}`),
			});
			for (const { dir, reason } of skipped) {
				ctx.say({ status: "info", label: `skipped ${dir}`, detail: `[skip docs] ${reason}` });
			}
			for (const dir of warn) {
				ctx.say({
					status: "info",
					label: `warning: ${dir}`,
					detail: "this feat changes the package's source without a docs change: update its README, page or a doc comment, or add `[skip docs] <reason>` to the PR description",
				});
			}
			if (missingReason) {
				ctx.say({
					status: "info",
					label: "[skip docs]",
					detail: "found, but it has no reason after it, so it does not count",
				});
			}
			if (warn.length === 0) {
				ctx.say({
					status: "ok",
					label: "feature docs",
					detail: "every changed package has a docs signal or a [skip docs] reason",
				});
			}
		},
	};
}
