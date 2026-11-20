import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import type { AreaLabelsTrigger } from "../area-labels.type.js";
import type { ReadAreaConfigResult } from "../read-area-config/index.js";
import { runAreaLabels } from "./run-area-labels.js";

vi.mock("../read-area-config/index.js", () => ({
	readAreaConfig: vi.fn(async () => ({ ok: false, reason: "from the default reader" })),
}));

const CONFIG: ReadAreaConfigResult = {
	ok: true,
	areas: { cli: ["cli/**"], sentinel: ["apps/sentinel/**"], ci: ["ci/**"] },
	scopes: { sentinel: "sentinel" },
};
const PR: AreaLabelsTrigger = { kind: "pull_request", number: 12 };
const ISSUE: AreaLabelsTrigger = { kind: "issue", number: 9 };

interface Setup {
	config?: ReadAreaConfigResult;
	state?: "open" | "closed";
	title?: string;
	labels?: string[];
	files?: { filename: string; previous_filename?: string }[];
	repoLabels?: string[];
}

function setup(opts: Setup = {}) {
	const addLabels = vi.fn(async () => undefined);
	const getIssue = vi.fn(async () => ({
		state: opts.state ?? "open",
		title: opts.title ?? "chore: x",
		labels: (opts.labels ?? []).map((name) => ({ name })),
	}));
	const listFiles = vi.fn(async () => opts.files ?? []);
	const listLabels = vi.fn(async () =>
		(opts.repoLabels ?? ["area:cli", "area:sentinel", "area:ci", "bug"]).map((name) => ({ name }))
	);
	const readConfig = vi.fn(async () => opts.config ?? CONFIG);
	const client = {
		issues: { getIssue, addLabels },
		pulls: { listFiles },
		labels: { listLabels },
	} as unknown as GitHubClient;
	const go = (trigger: AreaLabelsTrigger) => runAreaLabels({ client, repo: "acme/demo", trigger, readConfig });
	return { go, addLabels, getIssue, listFiles, listLabels, readConfig, client };
}

describe("runAreaLabels", () => {
	it("adds the areas of a pull request's changed files in one call", async () => {
		const s = setup({ files: [{ filename: "cli/a.ts" }, { filename: "ci/b.yml" }], labels: ["bug"] });
		expect(await s.go(PR)).toEqual({ status: "ok", added: ["area:cli", "area:ci"], missing: [], dropped: [] });
		expect(s.addLabels).toHaveBeenCalledExactlyOnceWith("acme/demo", 12, ["area:cli", "area:ci"]);
		expect(s.listFiles).toHaveBeenCalledWith("acme/demo", 12);
		expect(s.readConfig).toHaveBeenCalledWith({ client: s.client, repo: "acme/demo" });
	});

	it("counts both paths of a renamed file", async () => {
		const s = setup({ files: [{ filename: "ci/new.yml", previous_filename: "cli/old.yml" }] });
		expect((await s.go(PR)) as { added: string[] }).toMatchObject({ added: ["area:cli", "area:ci"] });
	});

	it("adds an issue's area from its title and reads no files", async () => {
		const s = setup({ title: "feat(sentinel): x" });
		expect(await s.go(ISSUE)).toEqual({ status: "ok", added: ["area:sentinel"], missing: [], dropped: [] });
		expect(s.addLabels).toHaveBeenCalledWith("acme/demo", 9, ["area:sentinel"]);
		expect(s.listFiles).not.toHaveBeenCalled();
	});

	it("writes nothing when the plan adds nothing, so a redelivery changes nothing", async () => {
		const s = setup({ files: [{ filename: "cli/a.ts" }], labels: ["area:cli"] });
		expect(await s.go(PR)).toEqual({ status: "ok", added: [], missing: [], dropped: [] });
		expect(s.addLabels).not.toHaveBeenCalled();
	});

	it("reports a label the repository lacks and does not make it", async () => {
		const s = setup({ title: "feat(sentinel): x", repoLabels: ["bug"] });
		expect(await s.go(ISSUE)).toEqual({ status: "ok", added: [], missing: ["area:sentinel"], dropped: [] });
		expect(s.addLabels).not.toHaveBeenCalled();
	});

	it("is a quiet skip for a repo that declares no areas, before it reads the item", async () => {
		const s = setup({ config: { ok: false, reason: "acme/demo declares no repo.labels.areas" } });
		expect(await s.go(PR)).toEqual({ status: "skipped", reason: "acme/demo declares no repo.labels.areas" });
		expect(s.getIssue).not.toHaveBeenCalled();
	});

	it("does nothing for a closed item", async () => {
		const s = setup({ state: "closed", files: [{ filename: "cli/a.ts" }] });
		expect(await s.go(PR)).toEqual({ status: "skipped", reason: "#12 is closed" });
		expect(s.listLabels).not.toHaveBeenCalled();
		expect(s.addLabels).not.toHaveBeenCalled();
	});

	it("reads the config through the default reader when none is injected", async () => {
		const client = {} as GitHubClient;
		expect(await runAreaLabels({ client, repo: "acme/demo", trigger: PR })).toEqual({
			status: "skipped",
			reason: "from the default reader",
		});
	});

	it("is a fail result, never a throw, when the API refuses", async () => {
		const s = setup({ files: [{ filename: "cli/a.ts" }] });
		s.addLabels.mockRejectedValue(new Error("Resource not accessible by integration"));
		expect(await s.go(PR)).toEqual({ status: "fail", reason: "Resource not accessible by integration" });
	});
});
