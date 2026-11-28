import { DEFAULT_ORG, DOT_GITHUB_REPO } from "@theholocron/astromech";
import { describe, expect, it } from "vitest";
import yargs from "yargs";

import { syncGithubArgs } from "../sync-github/sync-github.args.js";
import { newRepoArgs } from "./new-repo.args.js";

describe("the org coordinate defaults", () => {
	it("`new repo --org` defaults to the default org", () => {
		const argv = newRepoArgs(yargs([]) as never).parseSync([]) as { org: string };
		expect(argv.org).toBe(DEFAULT_ORG);
	});

	it("`sync github --repo` defaults to the org's .github repo", () => {
		const argv = syncGithubArgs(yargs([]) as never).parseSync([]) as { repo: string };
		expect(argv.repo).toBe(DOT_GITHUB_REPO);
	});
});
