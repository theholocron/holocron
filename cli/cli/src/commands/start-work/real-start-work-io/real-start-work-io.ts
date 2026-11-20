import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { runGit } from "@theholocron/kyber/git";

import type { StartWorkIo } from "../run-start-work/index.js";

/** The real git and file system {@link runStartWork} runs against; tests pass a fake. */
export function createRealStartWorkIo(): StartWorkIo {
	return {
		git: runGit,
		exists: (path) => existsSync(path),
		read: (path) => readFileSync(path, "utf8"),
		write: (path, text) => {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, text);
		},
		today: () => new Date().toISOString().slice(0, 10),
	};
}
