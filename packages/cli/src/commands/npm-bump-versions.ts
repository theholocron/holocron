import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface RunNpmBumpVersionsInput {
	/** Next version string (e.g., "4.2.0" or "2.0.0-alpha.1"). */
	version: string;
	/** Working directory (monorepo root). Defaults to process.cwd(). */
	cwd?: string;
	/** Print what would change without writing anything. */
	dryRun?: boolean;
	print?: (line: string) => void;
	/** Injectable for testing. */
	readFile?: (path: string) => string;
	writeFile?: (path: string, content: string) => void;
	listDir?: (path: string) => string[];
	isDir?: (path: string) => boolean;
}

export type BumpVersionsStatus = "ok" | "fail" | "dry-run";

export interface NpmBumpVersionsReport {
	status: BumpVersionsStatus;
	bumped: readonly string[];
	skipped: readonly string[];
	message?: string;
}

export async function runNpmBumpVersions(input: RunNpmBumpVersionsInput): Promise<NpmBumpVersionsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const cwd = input.cwd ?? process.cwd();
	const { version, dryRun = false } = input;
	const readFile = input.readFile ?? ((p: string) => readFileSync(p, "utf8"));
	const writeFile = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c));
	const listDir = input.listDir ?? ((p: string) => readdirSync(p) as string[]);
	const isDir = input.isDir ?? ((p: string) => statSync(p).isDirectory());

	const bumped: string[] = [];
	const skipped: string[] = [];

	print(`Bumping monorepo to ${version}${dryRun ? " (dry-run)" : ""}…`);

	function bumpFile(absPath: string, label: string): void {
		let pkg: Record<string, unknown>;
		try {
			pkg = JSON.parse(readFile(absPath)) as Record<string, unknown>;
		} catch {
			print(`  ✗ could not parse ${label}`);
			return;
		}
		const old = pkg.version as string;
		if (!dryRun) {
			pkg.version = version;
			writeFile(absPath, JSON.stringify(pkg, null, 2) + "\n");
		}
		print(`  ${dryRun ? "~" : "✓"} ${label}: ${old} → ${version}`);
		bumped.push(label);
	}

	// Root is always bumped — private means "don't publish", not "don't version".
	bumpFile(join(cwd, "package.json"), "root");

	const packagesDir = join(cwd, "packages");
	let entries: string[];
	try {
		entries = listDir(packagesDir);
	} catch {
		return { status: "fail", bumped, skipped, message: `packages/ directory not found in ${cwd}` };
	}

	for (const entry of entries) {
		const pkgDir = join(packagesDir, entry);
		try {
			if (!isDir(pkgDir)) continue;
		} catch {
			continue;
		}
		const pkgFile = join(pkgDir, "package.json");
		let pkg: Record<string, unknown>;
		try {
			pkg = JSON.parse(readFile(pkgFile)) as Record<string, unknown>;
		} catch {
			print(`  ! skipping packages/${entry}: no package.json or malformed JSON`);
			continue;
		}
		if (pkg.private) {
			print(`  · skipping private package packages/${entry}`);
			skipped.push(`packages/${entry}`);
			continue;
		}
		bumpFile(pkgFile, `packages/${entry}`);
	}

	return { status: dryRun ? "dry-run" : "ok", bumped, skipped };
}
