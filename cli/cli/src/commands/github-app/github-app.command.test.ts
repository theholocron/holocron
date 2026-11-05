import { beforeEach, describe, expect, it, vi } from "vitest";

const runGithubAppCreate = vi.hoisted(() => vi.fn());
vi.mock("../github-app-create/github-app-create.js", () => ({ runGithubAppCreate }));

import { runCommand } from "../run-command.testing.js";
import { githubAppCommand } from "./github-app.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	runGithubAppCreate.mockResolvedValue({ status: "ok" });
});

describe("github-app", () => {
	it("reaches `create` through the group", async () => {
		await runCommand(githubAppCommand, [
			"github-app",
			"create",
			"--name",
			"n",
			"--webhook-url",
			"https://t.example/x",
			"--manifest",
			"m.json",
		]);
		expect(runGithubAppCreate).toHaveBeenCalledTimes(1);
	});
});
