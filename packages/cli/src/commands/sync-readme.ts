import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LoadedConfig } from "../load-config.js";
import type { RuntimeContext } from "../loader.js";
import { style } from "../ui/style.js";

const README_INSTALL_START = "<!-- holocron:installation -->";
const README_INSTALL_END = "<!-- /holocron:installation -->";

interface PackageJson {
	name?: string;
	bin?: Record<string, string> | string;
	peerDependencies?: Record<string, string>;
}

export interface RunSyncReadmeInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	print?: (line: string) => void;
	readFileFn?: (path: string, encoding: BufferEncoding) => Promise<string>;
	writeFileFn?: (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
}

export interface SyncReadmeReport {
	status: "ok" | "fail" | "dry-run";
	updated: boolean;
	message?: string;
}

function generateInstallBlock(pkg: PackageJson, description: string): string {
	const { name = "", bin, peerDependencies = {} } = pkg;
	const isCli = Boolean(bin);
	const isReact = Boolean(peerDependencies["react"]);
	const lines: string[] = [];

	lines.push("## Installation", "");

	if (isCli) {
		lines.push("```bash", `npm install --global ${name}`, "```");
	} else {
		lines.push("```bash", `pnpm install ${name}`, "```");
	}

	lines.push("", "## Usage", "");

	if (isCli) {
		const commands =
			typeof bin === "string" || !bin ? [name.split("/").pop() ?? name] : Object.keys(bin);
		lines.push("```bash");
		for (const cmd of commands) {
			lines.push(`${cmd} --help`);
		}
		lines.push("```");
	} else if (isReact) {
		lines.push(
			"```tsx",
			`import { } from "${name}";`,
			"",
			"function App() {",
			`  return <></>;`,
			"}",
			"```"
		);
	} else {
		lines.push("```typescript", `import { } from "${name}";`, "```");
	}

	return lines.join("\n");
}

async function updateReadmeInstallation(
	repoRoot: string,
	block: string,
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

	const lines = content.split("\n");
	const startIdx = lines.findIndex((l) => l.trim() === README_INSTALL_START);
	const endIdx = lines.findIndex((l) => l.trim() === README_INSTALL_END);

	const blockLines = block.split("\n");

	if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
		if (dryRun) return true;
		lines.splice(startIdx + 1, endIdx - startIdx - 1, "", ...blockLines, "");
		await writeFileFn(readmePath, lines.join("\n"), "utf8");
		return true;
	}

	// No markers — find the first ## heading after the description block and insert before it
	const descEnd = lines.findIndex((l) => l.trim() === "<!-- /holocron:description -->");
	const insertAfter = descEnd !== -1 ? descEnd : lines.findIndex((l) => /^# /.test(l));
	if (insertAfter === -1) return false;

	if (dryRun) return true;
	lines.splice(
		insertAfter + 1,
		0,
		"",
		README_INSTALL_START,
		"",
		...blockLines,
		"",
		README_INSTALL_END
	);
	await writeFileFn(readmePath, lines.join("\n"), "utf8");
	return true;
}

export async function runSyncReadme(input: RunSyncReadmeInput): Promise<SyncReadmeReport> {
	const {
		loaded,
		context,
		print = console.log,
		readFileFn = readFile,
		writeFileFn = writeFile,
	} = input;

	const { repoRoot, dryRun = false } = context;
	const { description = "" } = loaded.resolved;

	print(style.header(`Syncing README installation block${dryRun ? " (dry-run)" : ""}…`));

	// Read package.json
	let pkg: PackageJson = {};
	try {
		const raw = await readFileFn(join(repoRoot, "package.json"), "utf8");
		pkg = JSON.parse(raw) as PackageJson;
	} catch {
		return { status: "fail", updated: false, message: "Could not read package.json" };
	}

	const block = generateInstallBlock(pkg, description);
	const updated = await updateReadmeInstallation(repoRoot, block, dryRun, readFileFn, writeFileFn);

	if (!updated) {
		print(style.warn("README.md not found or has no writable location for installation block"));
		return { status: "fail", updated: false, message: "README.md update failed" };
	}

	print(dryRun ? style.hint("  would update README.md") : style.success("  updated README.md"));
	return { status: dryRun ? "dry-run" : "ok", updated };
}
