import { describe, expect, it } from "vitest";

import { defaultRun } from "./default-run.js";

describe("defaultRun", () => {
	// Two real `node` spawns: generous timeout, since the full CI run starts them while
	// every other package's tests are also running.
	it("runs a command and captures its output and status", { timeout: 30_000 }, () => {
		const ok = defaultRun(process.execPath, ["-e", "process.stdout.write('hi')"], {});
		expect(ok).toMatchObject({ status: 0, stdout: "hi" });
		expect(defaultRun(process.execPath, ["-e", "process.exit(3)"], {}).status).toBe(3);
	});
});
