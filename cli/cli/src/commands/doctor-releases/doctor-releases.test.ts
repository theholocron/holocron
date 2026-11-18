import type { NpmDistTags } from "@theholocron/astromech";
import { describe, expect, it } from "vitest";

import { runDoctorReleases } from "./doctor-releases.js";
import type { ReleasesIo } from "./doctor-releases.type.js";

const NOW = 1_700_000_000;

function io(over: {
	tags?: { name: string; createdAt?: number }[];
	npm?: Record<string, NpmDistTags>;
	tagsError?: Error;
}): ReleasesIo {
	return {
		tags: () => {
			if (over.tagsError) throw over.tagsError;
			return over.tags ?? [];
		},
		packages: (scope) => (scope.group === "configs" ? ["@x/config"] : ["@x/cli"]),
		distTags: async (name) => over.npm?.[name],
		now: () => NOW,
	};
}

const run = (releases: ReleasesIo) => {
	const lines: string[] = [];
	return runDoctorReleases({
		loaded: { resolved: { tasks: [{ name: "release", with: { groups: ["configs"] } }] } } as never,
		context: { repoRoot: "/repo" },
		io: releases,
		print: (line) => lines.push(line),
	}).then((report) => ({ report, output: lines.join("\n") }));
};

describe("runDoctorReleases", () => {
	it("passes when npm serves each line's newest tag", async () => {
		const { report } = await run(
			io({
				tags: [{ name: "configs-v1.0.0-alpha.2" }, { name: "v5.0.0-alpha.9" }],
				npm: { "@x/config": { alpha: "1.0.0-alpha.2" }, "@x/cli": { alpha: "5.0.0-alpha.9" } },
			})
		);
		expect(report.status).toBe("ok");
		expect(report.summary).toMatchObject({ ok: 2, fail: 0 });
	});

	it("passes when a tag is level with npm and an older one was never published", async () => {
		const { report } = await run(
			io({
				tags: [{ name: "v5.0.0-alpha.8" }, { name: "v5.0.0-alpha.9" }],
				npm: { "@x/cli": { alpha: "5.0.0-alpha.9" } },
			})
		);
		expect(report.status).toBe("ok");
	});

	it("fails for a tag ahead of npm, naming the tag, its note and both causes", async () => {
		const { report, output } = await run(
			io({
				tags: [{ name: "configs-v1.0.0-alpha.3" }],
				npm: { "@x/config": { alpha: "1.0.0-alpha.2" } },
			})
		);
		expect(report.status).toBe("fail");
		expect(output).toContain("@x/config serves 1.0.0-alpha.2, tag is 1.0.0-alpha.3");
		expect(output).toContain("git push --delete origin configs-v1.0.0-alpha.3");
		expect(output).toContain(":refs/notes/semantic-release-configs-v1.0.0-alpha.3");
		expect(output).toContain("409");
		expect(output).toContain("ENEEDAUTH");
		expect(output).toContain("holocron publish package --sync-trust");
	});

	it("fails for a tag whose package is not on npm at all", async () => {
		const { report, output } = await run(io({ tags: [{ name: "v1.0.0" }], npm: {} }));
		expect(report.status).toBe("fail");
		expect(output).toContain("@x/cli serves nothing on latest, tag is 1.0.0");
	});

	it("skips a tag so new its release may still be publishing", async () => {
		const { report } = await run(io({ tags: [{ name: "v1.0.0", createdAt: NOW - 60 }], npm: {} }));
		expect(report.status).toBe("skip");
		expect(report.summary).toEqual({ ok: 0, fail: 0, skip: 1 });
	});

	it("skips with a reason when there are no tags", async () => {
		const { report } = await run(io({}));
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no release tags to check");
	});

	it("skips, never fails, when git or npm cannot be read", async () => {
		const { report } = await run(io({ tagsError: new Error("not a git repository") }));
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("not a git repository");
	});
});
