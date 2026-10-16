import { describe, expect, it } from "vitest";

import { shouldDeploy } from "./should-deploy.js";

const PATHS = ["packages/app/", "packages/cli/"];

describe("shouldDeploy", () => {
	it("deploys a release on the configured channel that touches a configured path", () => {
		expect(
			shouldDeploy({
				channel: "alpha",
				configuredChannel: "alpha",
				changedFiles: ["packages/cli/src/x.ts"],
				paths: PATHS,
			})
		).toEqual({ deploy: true, reason: "the release changes packages/cli/src/x.ts" });
	});

	it("skips another channel, including the stable one (`main`)", () => {
		expect(shouldDeploy({ channel: "main", configuredChannel: "alpha", changedFiles: [], paths: [] })).toEqual({
			deploy: false,
			reason: 'channel "main" isn\'t "alpha"',
		});
		expect(shouldDeploy({ channel: "beta", configuredChannel: "alpha", changedFiles: [], paths: [] }).deploy).toBe(
			false
		);
	});

	it("skips a release that touches none of the paths", () => {
		expect(
			shouldDeploy({ channel: "alpha", configuredChannel: "alpha", changedFiles: ["docs/x.md"], paths: PATHS })
		).toEqual({ deploy: false, reason: "the release changes nothing under packages/app/, packages/cli/" });
	});

	it("deploys when there's no previous release to diff against", () => {
		expect(
			shouldDeploy({ channel: "alpha", configuredChannel: "alpha", changedFiles: undefined, paths: PATHS }).deploy
		).toBe(true);
	});
});
