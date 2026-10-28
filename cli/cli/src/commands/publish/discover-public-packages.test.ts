import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import {
	baseEnv,
	makeExec,
	makeTempMonorepo,
	makeTempMonorepoWithPlugins,
	TEST_ORG,
	TEST_REPO,
} from "../../testing/publish-fixtures.js";
import type { PublishExecResult } from "./publish.type.js";
import { runPublish } from "./run-publish/index.js";

/** Every discovered package reports as not-yet-on-npm — i.e., all genuinely new. */
function allNewExec(): (cmd: string, args: string[]) => Promise<PublishExecResult> {
	return async (cmd, args) => {
		if (cmd === "npm" && args[0] === "whoami") return { exitCode: 0, stdout: "iamnewton", stderr: "" };
		if (cmd === "npm" && args[0] === "view") return { exitCode: 1, stdout: "", stderr: "npm error code E404" };
		return { exitCode: 0, stdout: "", stderr: "" };
	};
}

// ── discoverPublicPackages ────────────────────────────────────────────────────

describe("discoverPublicPackages (via runPublish without packages injection)", () => {
	it("discovers non-private packages and skips private, no-manifest, and invalid-JSON entries", async () => {
		const root = makeTempMonorepo([
			{ name: "@theholocron/public-a" },
			{ name: "@theholocron/public-b" },
			{ name: "@theholocron/private-c", private: true },
			{ name: "@theholocron/broken-d", invalidJson: true },
		]);
		const lines: string[] = [];
		const exec = allNewExec();
		await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("@theholocron/public-a/access");
		expect(joined).toContain("@theholocron/public-b/access");
		expect(joined).not.toContain("@theholocron/private-c/access");
		expect(joined).not.toContain("@theholocron/broken-d/access");
		expect(joined).not.toContain("no-manifest/access");
	});

	it("also discovers public plugins/* packages alongside packages/* (holocron#993 regression)", async () => {
		const root = makeTempMonorepoWithPlugins(
			[{ name: "@theholocron/cli" }],
			[
				{ name: "@theholocron/holocron-plugin-axiom" },
				{ name: "@theholocron/holocron-plugin-private", private: true },
			]
		);
		const lines: string[] = [];
		const exec = allNewExec();
		await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("@theholocron/cli/access");
		expect(joined).toContain("@theholocron/holocron-plugin-axiom/access");
		expect(joined).not.toContain("@theholocron/holocron-plugin-private/access");
	});

	it("falls back to the root package.json when there's no packages/ dir at all — fails loudly, no publish attempted", async () => {
		const lines: string[] = [];
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		// /tmp/test has neither a packages/ dir nor a package.json
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).not.toContain("npmjs.com/package/");
		expect(calls).toHaveLength(1); // whoami only — never reached pnpm
	});
});
