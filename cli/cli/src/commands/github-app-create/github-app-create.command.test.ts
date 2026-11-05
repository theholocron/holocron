import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runGithubAppCreate = vi.hoisted(() => vi.fn());
vi.mock("./github-app-create.js", () => ({ runGithubAppCreate }));

import { runCommand } from "../run-command.testing.js";
import { githubAppCreateCommand } from "./github-app-create.command.js";

const required = ["--name", "The App - dev", "--webhook-url", "https://t.example/api/webhook", "--manifest", "m.json"];

beforeEach(() => {
	vi.clearAllMocks();
	runGithubAppCreate.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("github-app create command", () => {
	it("passes the options, the working directory and the org", async () => {
		await runCommand(githubAppCreateCommand, ["create", ...required, "--org", "acme"], { cwd: "/work" });
		expect(runGithubAppCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				dir: "/work",
				manifest: "m.json",
				name: "The App - dev",
				webhookUrl: "https://t.example/api/webhook",
				org: "acme",
				webhookSecretVar: "SENTINEL_WEBHOOK_SECRET",
				keep: false,
				force: false,
			})
		);
	});

	it("passes the file, the webhook secret name and the keep and force flags", async () => {
		await runCommand(githubAppCreateCommand, [
			"create",
			...required,
			"--file",
			"dev.env",
			"--webhook-secret-var",
			"WH",
			"--keep",
			"--force",
		]);
		expect(runGithubAppCreate).toHaveBeenCalledWith(
			expect.objectContaining({ file: "dev.env", webhookSecretVar: "WH", keep: true, force: true })
		);
	});

	it("needs a name, a webhook URL and a manifest", async () => {
		await expect(runCommand(githubAppCreateCommand, ["create"])).rejects.toThrow(/Missing required/);
		expect(runGithubAppCreate).not.toHaveBeenCalled();
	});

	it("exits non-zero when it fails", async () => {
		runGithubAppCreate.mockResolvedValue({ status: "fail" });
		await runCommand(githubAppCreateCommand, ["create", ...required]);
		expect(process.exitCode).toBe(1);
	});
});
