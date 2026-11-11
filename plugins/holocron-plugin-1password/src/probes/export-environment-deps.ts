import { resolveEnvironmentId, stdoutKind } from "@theholocron/cli";
import { copyToClipboard, isGitIgnored, shredFile, writeCredentialsFile } from "@theholocron/kyber/secrets";

import type { OpCredentials } from "../capabilities/credentials.js";
import type { ExportEnvironmentDeps } from "./export-environment.type.js";

/** The real pieces `export-environment` runs on: the plugin's own reader, the repo root, this process's stdout and the shared secret-file helpers. */
export function exportEnvironmentDeps(credentials: OpCredentials, repoRoot: string): ExportEnvironmentDeps {
	return {
		read: (environment) => credentials.read(environment),
		repoRoot,
		resolveId: (id, root) => resolveEnvironmentId(id, { repoRoot: root }),
		outKind: () => stdoutKind(process.stdout.isTTY === true),
		out: (text) => void process.stdout.write(text),
		copy: copyToClipboard,
		writeFile: writeCredentialsFile,
		shred: shredFile,
		isIgnored: isGitIgnored,
		platform: process.platform,
		interactive: process.stdin.isTTY === true,
	};
}
