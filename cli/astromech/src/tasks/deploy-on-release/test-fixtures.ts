import { vi } from "vitest";

import type { Run } from "../../utils/index.js";

export const VERSION = "5.0.0-alpha.105";

/**
 * A fake runner: `git diff` returns `changed`, `npm view name@version` returns
 * that version once `served` (or fails, like an unpublished package), and the
 * deploy exits `deployStatus`.
 */
export function fakeRun({
	changed = ["packages/app/src/handler.ts"],
	diffStatus = 0,
	deployStatus = 0,
	served = true,
} = {}) {
	return vi.fn<Run>((command, args) => {
		if (command === "git") {
			return {
				status: diffStatus,
				stdout: changed.map((f) => `${f}\n`).join(""),
				stderr: diffStatus ? "bad revision" : "",
			};
		}
		if (command === "npm") {
			const spec = args[1] as string;
			const version = spec.slice(spec.lastIndexOf("@") + 1);
			return served
				? { status: 0, stdout: `${version}\n`, stderr: "" }
				: { status: 1, stdout: "", stderr: "E404 not found" };
		}
		return { status: deployStatus, stdout: "", stderr: "" };
	});
}

export const FILES: Record<string, unknown> = {
	"/repo/packages/app/package.json": {
		name: "@theholocron/app",
		version: "1.0.0",
		dependencies: { "@theholocron/cli": "workspace:*", "@theholocron/datapad": "workspace:^", yaml: "2.9.0" },
	},
	"/repo/packages/cli/package.json": { name: "@theholocron/cli", version: VERSION },
	"/repo/packages/datapad/package.json": { name: "@theholocron/datapad", version: VERSION },
	"/repo/packages/astromech/package.json": { name: "@theholocron/astromech", version: VERSION },
};
const DIRS = ["app", "cli", "datapad", "astromech", "no-manifest"];
export const TREE = {
	readJson: (path: string) => {
		if (!(path in FILES)) throw new Error(`ENOENT: ${path}`);
		return FILES[path];
	},
	listDirs: () => DIRS,
};

export /** A clock the test drives: `sleep` advances `now` instead of waiting. */
function fakeClock() {
	let t = 0;
	return {
		now: () => t,
		sleep: vi.fn((ms: number) => {
			t += ms;
			return Promise.resolve();
		}),
	};
}
