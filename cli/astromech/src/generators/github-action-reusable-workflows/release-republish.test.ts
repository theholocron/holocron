import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { REUSABLE_WORKFLOWS } from "./github-action-reusable-workflows.js";

describe("REUSABLE_WORKFLOWS['release'] republish job (holocron#1387)", () => {
	const wf = REUSABLE_WORKFLOWS["release"]!;
	const [releaseJob, afterRelease] = wf.split("\n  republish:\n") as [string, string];
	const republish = afterRelease.split("\n  deploy:\n")[0]!;

	it("is skipped for a normal release and skips the release job when a tag is given", () => {
		expect(releaseJob).toContain("if: ${{ inputs.republish-tag == '' }}");
		expect(republish).toContain("if: ${{ inputs.republish-tag != '' }}");
	});

	it("never tags, releases or pushes: no semantic-release, no write token, read-only contents", () => {
		expect(republish).not.toContain("semantic-release");
		expect(republish).not.toContain("HOLOCRON_RELEASE_TOKEN");
		expect(republish).toContain("contents: read");
		expect(republish).toContain("id-token: write");
		expect(republish).toContain("persist-credentials: false");
		expect(republish).not.toContain("contents: write");
	});

	it("checks out the tag, requires it on main or alpha, and runs publish package", () => {
		expect(republish).toContain("ref: refs/tags/${{ inputs.republish-tag }}");
		expect(republish).toContain("git merge-base --is-ancestor HEAD");
		expect(republish).toContain("command: publish package");
		expect(republish).toContain("args: ${{ steps.tag.outputs.args }}");
	});

	describe("the tag check script", () => {
		const script = republish
			.split("        run: |\n")[1]!
			.split("\n\n")[0]!
			.split("\n")
			.map((line) => line.slice(10))
			.join("\n");
		const run = (env: Record<string, string>) =>
			spawnSync("bash", ["-c", `set -e\nGITHUB_OUTPUT=$(mktemp)\n${script}\ncat "$GITHUB_OUTPUT"`], {
				encoding: "utf8",
				env: {
					PATH: process.env["PATH"] ?? "",
					TAG: "",
					RELEASE_GROUP: "",
					EXCLUDED_GROUPS: "",
					DRY_RUN: "false",
					...env,
				},
			});

		it("publishes a group's tag on its own channel, skipping what is already on npm", () => {
			expect(run({ TAG: "configs-v8.9.0-alpha.3", RELEASE_GROUP: "configs" }).stdout).toBe(
				"args=--skip-already-published --tag alpha --group configs\n"
			);
		});

		it("publishes a stable tag on latest", () => {
			expect(run({ TAG: "clients-v2.0.0", RELEASE_GROUP: "clients" }).stdout).toContain("--tag latest");
		});

		it("leaves the groups out for the repo-wide tag and previews on a dry run", () => {
			expect(run({ TAG: "v5.0.0-alpha.254", EXCLUDED_GROUPS: "utils clients", DRY_RUN: "true" }).stdout).toBe(
				"args=--skip-already-published --tag alpha --exclude-group utils --exclude-group clients --dry-run\n"
			);
		});

		it("refuses a tag that is not the group's", () => {
			for (const env of [
				{ TAG: "v5.0.0", RELEASE_GROUP: "configs" },
				{ TAG: "configs-v8.0.0", RELEASE_GROUP: "" },
				{ TAG: "nonsense", RELEASE_GROUP: "" },
			]) {
				const r = run(env);
				expect(r.status).toBe(1);
				expect(r.stdout).toContain("::error::");
			}
		});
	});
});
