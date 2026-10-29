import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getLogger } from "../../observability/logger/index.js";
import { style } from "../../ui/index.js";
import { generateReadme } from "./generate-readme.js";
import type { PackageJson, RunSyncReadmeInput, SyncReadmeReport } from "./sync-readme.type.js";
import { workspacePackages } from "./workspace-packages.js";

const MARKER_INSTALL_START = "<!-- holocron:installation -->";
const MARKER_INSTALL_END = "<!-- /holocron:installation -->";

function generateInstallBlock(pkg: PackageJson, homepage = ""): string {
	const { name = "", bin, peerDependencies = {} } = pkg;
	const isCli = Boolean(bin);
	const isReact = Boolean(peerDependencies["react"]);
	// A private package with no bin and nothing importable (no `main`, no
	// `exports`) is a workspace root or template — not something to `pnpm
	// install` or `import` from.
	const isConsumable = isCli || !pkg.private || Boolean(pkg.main) || pkg.exports !== undefined;
	const lines: string[] = [];

	lines.push("## Installation", "");

	if (!isConsumable) {
		lines.push(
			"This repository is a workspace root — it is not published. See the",
			"workspace packages for the tools it ships."
		);
		return lines.join("\n");
	}

	if (isCli) {
		lines.push("```bash", `npm install --global ${name}`, "```");
	} else {
		lines.push("```bash", `pnpm install ${name}`, "```");
	}

	lines.push("", "## Usage", "");

	if (isCli) {
		const commands =
			typeof bin === "string" ? [name.split("/").at(-1)!] : Object.keys(bin as Record<string, string>);
		lines.push("```bash");
		for (const cmd of commands) {
			lines.push(`${cmd} --help`);
		}
		lines.push("```");
	} else if (isReact) {
		lines.push("```tsx", `import {} from "${name}";`, "", "function App() {", `  return <></>;`, "}", "```");
	} else if (homepage) {
		// Exports aren't known at sync time — link the docs rather than emit a
		// meaningless empty-brace import.
		lines.push(`See the [documentation](${homepage}) for the API.`);
	} else {
		lines.push("See the package documentation for the API.");
	}

	return lines.join("\n");
}

/**
 * Replace content between `<!-- holocron:marker -->` / `<!-- /holocron:marker -->` tags.
 * Returns the updated README string, or the original if the marker pair is absent.
 */
function replaceMarkerBlock(readme: string, marker: string, content: string): string {
	const start = `<!-- holocron:${marker} -->`;
	const end = `<!-- /holocron:${marker} -->`;
	const lines = readme.split("\n");
	const startIdx = lines.findIndex((l) => l.trim() === start);
	const endIdx = lines.findIndex((l) => l.trim() === end);
	if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return readme;
	lines.splice(startIdx + 1, endIdx - startIdx - 1, "", ...content.split("\n"), "");
	return lines.join("\n");
}

/**
 * Apply all README updates in a single read-write cycle.
 * Returns true if the README was found (even if no changes were needed).
 */
async function updateReadme(
	repoRoot: string,
	installBlock: string,
	sections: Record<string, string>,
	dryRun: boolean,
	readFileFn: (path: string, encoding: BufferEncoding) => Promise<string>,
	writeFileFn: (path: string, content: string, encoding: BufferEncoding) => Promise<void>
): Promise<boolean> {
	const readmePath = join(repoRoot, "README.md");
	let content: string;
	try {
		content = await readFileFn(readmePath, "utf8");
	} catch {
		return false;
	}

	let updated = content;

	// Replace existing marker blocks for generated sections
	for (const [marker, text] of Object.entries(sections)) {
		updated = replaceMarkerBlock(updated, marker, text);
	}

	// Replace or insert installation block
	const lines = updated.split("\n");
	const startIdx = lines.findIndex((l) => l.trim() === MARKER_INSTALL_START);
	const endIdx = lines.findIndex((l) => l.trim() === MARKER_INSTALL_END);
	const blockLines = installBlock.split("\n");

	if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
		lines.splice(startIdx + 1, endIdx - startIdx - 1, "", ...blockLines, "");
		updated = lines.join("\n");
	} else {
		const descEnd = lines.findIndex((l) => l.trim() === "<!-- /holocron:description -->");
		const insertAfter = descEnd !== -1 ? descEnd : lines.findIndex((l) => /^# /.test(l));
		if (insertAfter === -1) return false;
		lines.splice(insertAfter + 1, 0, "", MARKER_INSTALL_START, "", ...blockLines, "", MARKER_INSTALL_END);
		updated = lines.join("\n");
	}

	if (!dryRun) {
		await writeFileFn(readmePath, updated, "utf8");
	}
	return true;
}

async function updateIndexMdxDescription(
	repoRoot: string,
	description: string,
	dryRun: boolean,
	readFileFn: (path: string, encoding: BufferEncoding) => Promise<string>,
	writeFileFn: (path: string, content: string, encoding: BufferEncoding) => Promise<void>
): Promise<void> {
	const mdxPath = join(repoRoot, "docs", "src", "content", "docs", "index.mdx");
	let content: string;
	try {
		content = await readFileFn(mdxPath, "utf8");
	} catch {
		return; // file doesn't exist — skip silently
	}
	const updated = content.replace(/^(description:\s*).*$/m, `$1${description}`);
	if (updated !== content && !dryRun) {
		await writeFileFn(mdxPath, updated, "utf8");
	}
}

export async function runSyncReadme(input: RunSyncReadmeInput): Promise<SyncReadmeReport> {
	const { loaded, context, print = console.log, readFileFn = readFile, writeFileFn = writeFile, discoverFn } = input;
	const logger = input.logger ?? getLogger();

	const { repoRoot, dryRun = false } = context;

	const namespaces = loaded.resolved.env?.namespaces ?? [];

	print(style.header(`Syncing README installation block${dryRun ? " (dry-run)" : ""}…`));
	if (namespaces.length > 0) {
		print(style.hint(`  namespaces: ${namespaces.join(", ")}`));
	}

	// Read package.json
	let pkg: PackageJson;
	try {
		const raw = await readFileFn(join(repoRoot, "package.json"), "utf8");
		pkg = JSON.parse(raw) as PackageJson;
	} catch {
		logger.warn({ repoRoot, reason: "could not read package.json" }, "sync readme: done");
		return { status: "fail", updated: false, message: "Could not read package.json" };
	}

	// Assemble generated sections (4.3)
	const description = loaded.resolved.description ?? "";
	const homepage = loaded.resolved.homepage ?? pkg.homepage ?? "";
	const scripts = pkg.scripts ?? {};
	const packages = workspacePackages(repoRoot, discoverFn);

	const sections = generateReadme({ description, homepage, scripts, packages });
	const markerSections: Record<string, string> = {
		...(sections.packages !== undefined && { packages: sections.packages }),
		development: sections.development,
		releases: sections.releases,
	};

	// Single read-write pass for all README changes
	const installBlock = generateInstallBlock(pkg, homepage);
	const updated = await updateReadme(repoRoot, installBlock, markerSections, dryRun, readFileFn, writeFileFn);

	if (!updated) {
		print(style.warn("README.md not found or has no writable location for installation block"));
		logger.warn({ repoRoot, reason: "README.md not found / no marker block" }, "sync readme: done");
		return { status: "fail", updated: false, message: "README.md update failed" };
	}

	// Update docs/src/content/docs/index.mdx frontmatter description (4.4)
	if (description) {
		await updateIndexMdxDescription(repoRoot, description, dryRun, readFileFn, writeFileFn);
	}

	print(dryRun ? style.hint("  would update README.md") : style.success("  updated README.md"));
	const status = dryRun ? "dry-run" : "ok";
	logger.info({ repoRoot, status, updated }, "sync readme: done");
	return { status, updated };
}
