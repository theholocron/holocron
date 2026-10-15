import { describe, expect, it } from "vitest";

import { defaultRun } from "./default-run.js";

describe("defaultRun", () => {
	it("defaultRun runs a command and captures its output and status", () => {
		const ok = defaultRun("node", ["-e", "process.stdout.write('hi')"], {});
		expect(ok).toMatchObject({ status: 0, stdout: "hi" });
		expect(defaultRun("node", ["-e", "process.exit(3)"], {}).status).toBe(3);
	});
});
