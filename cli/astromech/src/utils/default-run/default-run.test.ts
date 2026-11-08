import { describe, expect, it } from "vitest";

import { defaultRun } from "./default-run.js";

describe("defaultRun", () => {
	it("runs a command and captures its output and status", () => {
		const ok = defaultRun(process.execPath, ["-e", "process.stdout.write('hi')"], {});
		expect(ok).toMatchObject({ status: 0, stdout: "hi" });
		expect(defaultRun(process.execPath, ["-e", "process.exit(3)"], {}).status).toBe(3);
	});
});
