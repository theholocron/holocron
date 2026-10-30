import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { realExec } from "./exec.js";

// Each case spawns a real Node process; under a loaded full-suite run that can
// take longer than the default 5s.
describe("realExec", { timeout: 30_000 }, () => {
	let dir: string | undefined;
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it("returns the child's exit code", () => {
		expect(realExec(process.execPath, ["-e", "process.exit(3)"], { cwd: process.cwd() })).toEqual({ exitCode: 3 });
	});

	it("runs in the given cwd, not the test runner's", () => {
		// realpath: macOS tmpdir is a symlink, and the child reports the resolved path.
		dir = realpathSync(mkdtempSync(join(tmpdir(), "astromech-exec-")));
		expect(dir).not.toBe(process.cwd());
		const code = realExec(
			process.execPath,
			["-e", `process.exit(process.cwd() === ${JSON.stringify(dir)} ? 0 : 1)`],
			{ cwd: dir }
		);
		expect(code).toEqual({ exitCode: 0 });
	});

	it("adds the given variables to the child's environment", () => {
		const code = realExec(
			process.execPath,
			["-e", "process.exit(process.env.HOLOCRON_TEST_VAR === 'yes' ? 0 : 1)"],
			{
				cwd: process.cwd(),
				env: { HOLOCRON_TEST_VAR: "yes" },
			}
		);
		expect(code).toEqual({ exitCode: 0 });
	});

	it("reports -1 when the command cannot be spawned", () => {
		expect(realExec("holocron-no-such-binary", [], { cwd: process.cwd() })).toEqual({ exitCode: -1 });
	});
});
