import type { Coverage, CoverageNameDiff, CoverageRepoReport, ProbeRow } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { repoProbe } from "./repo.js";

const same = (names: string[]): CoverageNameDiff => ({ expected: names, missing: [], extra: [] });

async function run(
	result: CoverageRepoReport | Error | "no-method",
	over: { repo?: string | null } = {}
): Promise<ProbeRow[]> {
	const rows: ProbeRow[] = [];
	const coverage: Coverage = {
		key: "coverage",
		providerName: "codecov",
		checkToken: async () => ({ outcome: "accepted" }),
		...(result === "no-method"
			? {}
			: {
					checkRepo: async () => {
						if (result instanceof Error) throw result;
						return result;
					},
				}),
	};
	const probe = repoProbe({
		coverage: () => coverage,
		expected: () => ({ flags: ["a"], components: ["a"] }),
		repo: over.repo === null ? undefined : (over.repo ?? "theholocron/holocron"),
	});
	expect(probe.writes).toBe(false);
	await probe.run({
		dryRun: false,
		say: (r) => void rows.push(r),
		secret: () => {},
		write: async () => undefined,
		cleanup: () => {},
	});
	return rows;
}

describe("repo probe", () => {
	it("says ok for a list that matches", async () => {
		const rows = await run({ checked: true, flags: same(["a"]), components: same(["a", "b"]) });
		expect(rows).toEqual([
			{ status: "ok", label: "components", detail: "2 declared, all on Codecov for theholocron/holocron" },
			{ status: "ok", label: "flags", detail: "1 declared, all on Codecov for theholocron/holocron" },
		]);
	});

	it("fails a missing component, and only informs about a missing flag and about extras", async () => {
		const rows = await run({
			checked: true,
			flags: { expected: ["a", "b"], missing: ["b"], extra: ["old-flag"] },
			components: { expected: ["a", "b"], missing: ["b"], extra: ["old-component"] },
		});
		expect(rows.map((r) => [r.status, r.label])).toEqual([
			["fail", "component b"],
			["info", "component old-component"],
			["info", "flag b"],
			["info", "flag old-flag"],
		]);
	});

	it("is info, naming the reason, when the repository could not be checked", async () => {
		const rows = await run({
			checked: false,
			reason: "set HOLOCRON_CODECOV_API_TOKEN to a token",
			flags: same([]),
			components: same([]),
		});
		expect(rows).toEqual([
			{ status: "info", label: "Codecov API", detail: "set HOLOCRON_CODECOV_API_TOKEN to a token" },
		]);
	});

	it("falls back to a generic detail when no reason is given", async () => {
		const rows = await run({ checked: false, flags: same([]), components: same([]) });
		expect(rows[0]?.detail).toBe("not checked");
	});

	it("fails for an error that says nothing about access", async () => {
		const rows = await run(new Error("offline"));
		expect(rows).toEqual([{ status: "fail", label: "Codecov API", detail: "offline" }]);
	});

	it("is info when the provider has no repository check", async () => {
		const rows = await run("no-method");
		expect(rows[0]?.status).toBe("info");
	});

	it("is info when the options name no repository", async () => {
		const rows = await run({ checked: true, flags: same([]), components: same([]) }, { repo: null });
		expect(rows).toEqual([expect.objectContaining({ status: "info", label: "repository" })]);
	});
});
