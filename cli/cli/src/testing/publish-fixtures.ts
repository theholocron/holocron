import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { PublicPackageEntry } from "../commands/publish/public-package-entry.type.js";
import type { PublishExecResult } from "../commands/publish/publish.type.js";

export type TempPackageSpec = { name: string; version?: string; private?: boolean; invalidJson?: boolean };

/**
 * A repo on disk, laid out by `files`: each repo-relative path maps to a JSON object
 * (written as JSON) or a string (written verbatim, e.g. `pnpm-workspace.yaml`).
 * Returns its root.
 */
export function makeTempWorkspace(files: Record<string, Record<string, unknown> | string>): string {
	const root = mkdtempSync(join(tmpdir(), "holocron-workspace-"));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), typeof content === "string" ? content : JSON.stringify(content));
	}
	return root;
}

function writeTempWorkspaceDir(root: string, dirName: "packages" | "plugins", packages: TempPackageSpec[]) {
	const dirPath = join(root, dirName);
	mkdirSync(dirPath);
	for (const pkg of packages) {
		const dir = join(dirPath, pkg.name.replace(/\//g, "-"));
		mkdirSync(dir);
		const content = pkg.invalidJson
			? "not valid json {"
			: JSON.stringify({
					name: pkg.name,
					version: pkg.version ?? "1.0.0",
					...(pkg.private ? { private: true } : {}),
				});
		writeFileSync(join(dir, "package.json"), content);
	}
	// Directory with no package.json — should be skipped
	mkdirSync(join(dirPath, "no-manifest"));
}

export function makeTempMonorepo(packages: TempPackageSpec[]) {
	const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
	writeTempWorkspaceDir(root, "packages", packages);
	return root;
}

export function makeTempMonorepoWithPlugins(packages: TempPackageSpec[], plugins: TempPackageSpec[]) {
	const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
	writeTempWorkspaceDir(root, "packages", packages);
	writeTempWorkspaceDir(root, "plugins", plugins);
	return root;
}

export function makeTempPluginsOnlyRepo(plugins: TempPackageSpec[]) {
	const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
	writeTempWorkspaceDir(root, "plugins", plugins);
	return root;
}

export function makeExec(responses: Record<string, PublishExecResult>) {
	const calls: Array<{ cmd: string; args: string[] }> = [];
	const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
		calls.push({ cmd, args: [...args] });
		return (
			responses[cmd] ?? {
				exitCode: 0,
				stdout: "",
				stderr: "",
			}
		);
	};
	return { exec, calls };
}

export const baseEnv: NodeJS.ProcessEnv = {};

// Fixtures injected directly to avoid touching the filesystem or git in tests.
export const TEST_PACKAGES: readonly PublicPackageEntry[] = [
	{ name: "@theholocron/foo", version: "1.0.0", dir: "./packages/foo" },
	{ name: "@theholocron/bar", version: "2.0.0", dir: "./packages/bar" },
];
export const TEST_REPO = "test-repo";
export const TEST_ORG = "test-org";

/** Queue-based exec mock — each call consumes the next queued response, matched by call index. */
export function makeQueueExec(responses: PublishExecResult[]) {
	let i = 0;
	const calls: Array<{ cmd: string; args: string[] }> = [];
	const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
		calls.push({ cmd, args: [...args] });
		const next = responses[i] ?? { exitCode: 0, stdout: "{}", stderr: "" };
		i += 1;
		return next;
	};
	return { exec, calls };
}

export const ok = (stdout = "{}"): PublishExecResult => ({ exitCode: 0, stdout, stderr: "" });
export const eotp = (authUrl = "https://www.npmjs.com/auth/cli/test-id"): PublishExecResult => ({
	exitCode: 1,
	stdout: JSON.stringify({ error: { code: "EOTP", authUrl } }),
	stderr: "",
});
