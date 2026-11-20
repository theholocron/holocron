import { describe, expect, it, vi } from "vitest";

import type { PullRequest, Source } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import type { RunCloseWorkInput } from "../run-close-work/index.js";
import { abandonWork } from "./abandon-work.js";

const pr: PullRequest = {
	number: 7,
	title: "t",
	state: "open",
	merged: false,
	branch: "feat/12-x",
	url: "https://x/7",
};

interface World {
	branches?: string;
	listThrows?: boolean;
	revListThrows?: boolean;
	unpushed?: number;
}

function gitFor(world: World = {}) {
	return (args: readonly string[]): string => {
		const [a, b] = args;
		if (a === "for-each-ref") {
			if (world.listThrows) throw new Error("no git");
			return world.branches ?? "";
		}
		if (a === "rev-parse" && b === "--verify") return "sha";
		if (a === "rev-parse") return "tip";
		if (a === "rev-list") {
			if (world.revListThrows) throw new Error("bad ref");
			return String(world.unpushed ?? 0);
		}
		if (a === "worktree" && b === "list")
			return "worktree /main\nbranch refs/heads/alpha\n\nworktree /wt/x\nbranch refs/heads/feat/12-x\n";
		if (a === "ls-remote") return "";
		return "";
	};
}

function run(
	over: {
		world?: World;
		source?: Partial<Source>;
		input?: Partial<RunCloseWorkInput>;
		pullRequest?: PullRequest | undefined;
		ask?: (message: string) => Promise<boolean>;
	} = {}
) {
	const source = {
		providerName: "github",
		listPullRequestFiles: vi.fn(async () => [".notes/a.spec.md"]),
		updatePullRequest: vi.fn(async () => ({})),
		...over.source,
	} as unknown as Source;
	const ask = over.ask ?? vi.fn(async () => true);
	const input = {
		issue: "#12",
		loaded: loadedWith({}),
		context: { repoRoot: "/main" },
		git: gitFor(over.world),
		yes: true,
		withdrawSpecs: vi.fn(async () => ({ ok: true, detail: "withdrew" })),
		...over.input,
	} as RunCloseWorkInput;
	return {
		source,
		ask,
		result: abandonWork({
			input,
			key: "#12",
			source,
			loader: fakeLoader({}),
			ask,
			...("pullRequest" in over
				? over.pullRequest
					? { pullRequest: over.pullRequest }
					: {}
				: { pullRequest: pr }),
		}),
	};
}
const detail = (rows: Array<{ id: string; detail: string }>, id: string) => rows.find((r) => r.id === id)?.detail;

describe("abandonWork", () => {
	it("fails, writing nothing, when the branches cannot be listed", async () => {
		const { result } = run({ pullRequest: undefined, world: { listThrows: true } });
		const { rows } = await result;
		expect(detail(rows, "local branch")).toContain("could not list the branches: no git");
	});

	it("fails when the branch cannot be read, and says `it` for a single unpushed commit", async () => {
		const { rows } = await run({ world: { revListThrows: true } }).result;
		expect(detail(rows, "unpushed commits")).toContain("could not read feat/12-x");
		const one = await run({ world: { unpushed: 1 } }).result;
		expect(detail(one.rows, "unpushed commits")).toContain("1 commit no remote branch has; push it");
	});

	it("names only what exists in the question: no pull request, no branch", async () => {
		const ask = vi.fn(async (_message: string) => false);
		const { result } = run({ pullRequest: undefined, input: { yes: false }, ask });
		expect((await result).cancelled).toBe(true);
		const message = String(ask.mock.calls[0]?.[0]);
		expect(message).not.toContain("close pull request");
		expect(message).not.toContain("remove the worktree");
	});

	it("says the pull request holds no spec when the provider cannot list files", async () => {
		const { rows } = await run({ source: { listPullRequestFiles: undefined } }).result;
		expect(detail(rows, "spec")).toContain("holds no spec or ADR");
	});

	it("reports files that cannot be read and does not try to withdraw", async () => {
		const withdrawSpecs = vi.fn();
		const { rows } = await run({
			source: {
				listPullRequestFiles: vi.fn(async () => {
					throw new Error("403");
				}),
			},
			input: { withdrawSpecs },
		}).result;
		expect(detail(rows, "spec")).toContain("could not read the pull request's files: 403");
		expect(withdrawSpecs).not.toHaveBeenCalled();
	});

	it("fails a provider that cannot close a pull request", async () => {
		const { rows } = await run({ source: { updatePullRequest: undefined } }).result;
		expect(detail(rows, "pull request")).toContain("cannot close a pull request");
	});

	it("fails when no way to withdraw the post was given, or it throws", async () => {
		const none = await run({ input: { withdrawSpecs: undefined } }).result;
		expect(detail(none.rows, "spec")).toContain("no way to withdraw");
		const throws = await run({
			input: {
				withdrawSpecs: async () => {
					throw new Error("forum gone");
				},
			},
		}).result;
		expect(detail(throws.rows, "spec")).toContain("could not withdraw the post: forum gone");
	});

	it("keeps the worktree with --keep-worktree", async () => {
		const { rows } = await run({ input: { keepWorktree: true } }).result;
		expect(detail(rows, "worktree")).toContain("--keep-worktree");
	});
});
