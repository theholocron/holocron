import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type {
	Tooling,
	ToolingWorkspaceFile,
	ToolingWorkspaceInput,
	ToolingWorkspaceResult,
} from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runSyncRequests } from "./run-sync-requests.js";
import type { RunSyncRequestsInput } from "./run-sync-requests.type.js";

const OPTIONS = { collectionFiles: ["api/webhook.collection.json"], envFiles: ["api/webhook.environment.json"] };

const tool = (name: string, workspace?: Tooling["workspace"]): Tooling =>
	({
		key: "tooling",
		providerName: name,
		sync: vi.fn(),
		doctor: vi.fn(),
		...(workspace ? { workspace } : {}),
	}) as Tooling;

const FILES: ToolingWorkspaceFile[] = [
	{ path: ".bruno/collections/a/ping.yml", state: "changed" },
	{ path: ".bruno/collections/a/pong.yml", state: "new" },
	{ path: ".bruno/workspace.yml", state: "unchanged" },
];
const result = (files: ToolingWorkspaceFile[] = FILES, issues: ToolingWorkspaceResult["issues"] = []) => ({
	files,
	issues,
});
const IN_SYNC = [{ path: ".bruno/workspace.yml", state: "unchanged" as const }];

async function run(
	tools: Tooling[],
	providers: Array<[string, Record<string, unknown>]> = tools.map((t) => [t.providerName, OPTIONS]),
	over: Partial<RunSyncRequestsInput> = {}
) {
	const lines: string[] = [];
	const report = await runSyncRequests({
		loaded: loadedWith({ tooling: providers }),
		context: { repoRoot: "/repo" },
		yes: true,
		loader: fakeLoader({ tooling: tools }),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...over,
	});
	return { report, text: lines.join("\n") };
}

describe("runSyncRequests", () => {
	it("compares first as a dry run, then writes with the files, the repo root and no dry run", async () => {
		const workspace = vi.fn(async (_input: ToolingWorkspaceInput) => result());
		const { report, text } = await run([tool("bruno", workspace)]);
		expect(workspace.mock.calls.map(([input]) => input)).toEqual([
			{ ...OPTIONS, repoRoot: "/repo", dryRun: true },
			{ ...OPTIONS, repoRoot: "/repo" },
		]);
		expect(report.status).toBe("ok");
		expect(text).toContain("wrote 2 file(s) (1 new, 1 changed, 1 unchanged)");
		expect(text).toContain(
			"Wrote:\n  changed .bruno/collections/a/ping.yml\n  new     .bruno/collections/a/pong.yml"
		);
		expect(text).toContain("1 ok, 0 fail, 0 skipped");
	});

	it("asks nothing when everything is in sync, and still lets the provider bring its own files up to date", async () => {
		const workspace = vi.fn(async (_input: ToolingWorkspaceInput) => result(IN_SYNC));
		const { report, text } = await run([tool("bruno", workspace)], undefined, { yes: false, interactive: false });
		expect(workspace.mock.calls.map(([input]) => input.dryRun)).toEqual([true, undefined]);
		expect(report.status).toBe("ok");
		expect(text).toContain("in sync (1 unchanged)");
		expect(text).not.toContain("Wrote:");
	});

	it("only compares on a dry run, and says what it would write", async () => {
		const workspace = vi.fn(async () => result());
		const { report, text } = await run([tool("bruno", workspace)], undefined, {
			context: { repoRoot: "/repo", dryRun: true },
			yes: false,
		});
		expect(workspace).toHaveBeenCalledTimes(1);
		expect(report.status).toBe("ok");
		expect(text).toContain("(dry-run)");
		expect(text).toContain("would write 2 file(s)");
		expect(text).toContain("Would write:\n  changed .bruno/collections/a/ping.yml");
	});

	describe("--check", () => {
		it("fails, writes nothing and asks nothing when a file is out of date", async () => {
			const workspace = vi.fn(async () => result());
			const { report, text } = await run([tool("bruno", workspace)], undefined, { check: true, yes: false });
			expect(workspace).toHaveBeenCalledTimes(1);
			expect(report.status).toBe("fail");
			expect(text).toContain("(check)");
			expect(text).toContain(
				"2 file(s) out of date (1 new, 1 changed, 1 unchanged); run `holocron sync requests`"
			);
			expect(text).toContain("Out of date:\n  changed .bruno/collections/a/ping.yml");
			expect(inquirerConfirm).not.toHaveBeenCalled();
		});

		it("passes when everything is in sync", async () => {
			const { report } = await run([tool("bruno", async () => result(IN_SYNC))], undefined, { check: true });
			expect(report.status).toBe("ok");
		});
	});

	describe("asking first", () => {
		it("asks once, naming the files and the providers, and writes when the answer is yes", async () => {
			const workspace = vi.fn(async () => result());
			const confirm = vi.fn(async () => true);
			const { report } = await run([tool("bruno", workspace)], undefined, {
				yes: false,
				interactive: true,
				confirm,
			});
			expect(confirm).toHaveBeenCalledWith("Write 2 file(s) for bruno?");
			expect(workspace).toHaveBeenCalledTimes(2);
			expect(report.status).toBe("ok");
		});

		it("writes nothing when the answer is no", async () => {
			const workspace = vi.fn(async () => result());
			const { report, text } = await run([tool("bruno", workspace)], undefined, {
				yes: false,
				interactive: true,
				confirm: async () => false,
			});
			expect(workspace).toHaveBeenCalledTimes(1);
			expect(report).toEqual({ status: "cancelled", rows: [] });
			expect(text).toContain("cancelled; nothing was written");
		});

		it("refuses without a terminal and without --yes", async () => {
			const attempt = run([tool("bruno", async () => result())], undefined, { yes: false, interactive: false });
			await expect(attempt).rejects.toBeInstanceOf(NonInteractiveError);
			await expect(attempt).rejects.toThrow(/writes 2 file\(s\); pass --yes/);
		});

		it("asks with an inquirer prompt when none is injected", async () => {
			inquirerConfirm.mockResolvedValueOnce(true);
			await run([tool("bruno", async () => result())], undefined, { yes: false, interactive: true });
			expect(inquirerConfirm).toHaveBeenCalledWith({ message: "Write 2 file(s) for bruno?", default: false });
		});
	});

	it("lists a conversion issue under the row without failing the run", async () => {
		const { report, text } = await run([
			tool("bruno", async () =>
				result(IN_SYNC, [{ file: "api/webhook.collection.json", message: "lost a script" }])
			),
		]);
		expect(report.status).toBe("ok");
		expect(text).toContain("issue in api/webhook.collection.json: lost a script");
	});

	it("syncs only the provider --to names", async () => {
		const bruno = vi.fn(async () => result(IN_SYNC));
		const postman = vi.fn(async () => result(IN_SYNC));
		await run([tool("bruno", bruno), tool("postman", postman)], undefined, { to: "postman" });
		expect(bruno).not.toHaveBeenCalled();
		expect(postman).toHaveBeenCalledTimes(2);
	});

	describe("what it cannot do", () => {
		it("fails when the config has no tooling provider", async () => {
			const { report, text } = await run([], []);
			expect(report.status).toBe("fail");
			expect(text).toContain("the config has no `tooling` provider to sync for");
		});

		it("fails when --to names a provider the config does not have", async () => {
			const { report, text } = await run([tool("bruno", async () => result())], undefined, { to: "postman" });
			expect(report.status).toBe("fail");
			expect(text).toContain("not a `tooling` provider of this config (bruno)");
		});

		it("fails a provider that did not load", async () => {
			const { report, text } = await run([], [["bruno", OPTIONS]]);
			expect(report.status).toBe("fail");
			expect(text).toContain("the provider is not available");
		});

		it("fails a provider when the loader carries no tooling capability at all", async () => {
			const lines: string[] = [];
			const report = await runSyncRequests({
				loaded: loadedWith({ tooling: [["bruno", OPTIONS]] }),
				context: { repoRoot: "/repo" },
				yes: true,
				loader: fakeLoader({}),
				print: (l) => lines.push(stripVTControlCharacters(l)),
			});
			expect(report.status).toBe("fail");
			expect(lines.join("\n")).toContain("the provider is not available");
		});

		it("skips a provider with no workspace of its own", async () => {
			const { report, text } = await run([tool("postman")]);
			expect(report.status).toBe("ok");
			expect(text).toContain("has no workspace of its own to keep in step");
			expect(text).toContain("0 ok, 0 fail, 1 skipped");
		});

		it("skips a provider that names no collection files", async () => {
			const workspace = vi.fn();
			const { text } = await run([tool("bruno", workspace)], [["bruno", {}]]);
			expect(workspace).not.toHaveBeenCalled();
			expect(text).toContain("names no `collectionFiles`, so there is nothing to sync");
		});

		it("fails a provider whose comparison throws, and goes on with the next", async () => {
			const bad = tool("bad", async () => {
				throw new Error("cannot read the collection");
			});
			const good = vi.fn(async () => result(IN_SYNC));
			const { report, text } = await run([bad, tool("good", good)]);
			expect(report.status).toBe("fail");
			expect(text).toContain("cannot read the collection");
			expect(good).toHaveBeenCalledTimes(2);
		});

		it("fails a provider whose write throws", async () => {
			let calls = 0;
			const flaky = tool("bruno", async () => {
				calls += 1;
				if (calls > 1) throw new Error("disk full");
				return result();
			});
			const { report, text } = await run([flaky]);
			expect(report.status).toBe("fail");
			expect(text).toContain("disk full");
		});
	});
	describe("a conflict", () => {
		const CONFLICT: ToolingWorkspaceFile[] = [
			{
				path: "api/webhook.collection.json",
				state: "conflict",
				note: "changed on both sides; pass --prefer source or --prefer workspace",
			},
			{ path: ".bruno/collections/a/ping.yml", state: "unchanged" },
		];

		it("fails the provider's row with the note, writes nothing and asks nothing", async () => {
			const workspace = vi.fn(async () => result(CONFLICT));
			const confirm = vi.fn(async () => true);
			const { report, text } = await run([tool("bruno", workspace)], undefined, {
				yes: false,
				interactive: true,
				confirm,
			});
			expect(report.status).toBe("fail");
			expect(workspace).toHaveBeenCalledTimes(1);
			expect(confirm).not.toHaveBeenCalled();
			expect(text).toContain("1 conflict(s), so nothing was written (1 conflict, 1 unchanged)");
			expect(text).toContain("api/webhook.collection.json: changed on both sides; pass --prefer source");
			expect(text).not.toContain("Wrote:");
		});

		it("says so with a generic line when the provider gave no note", async () => {
			const { text } = await run([
				tool("bruno", async () => result([{ path: "api/webhook.collection.json", state: "conflict" }])),
			]);
			expect(text).toContain("api/webhook.collection.json: both sides changed");
		});

		it("fails --check and --dry-run too", async () => {
			const checked = await run([tool("bruno", async () => result(CONFLICT))], undefined, { check: true });
			expect(checked.report.status).toBe("fail");
			const dry = await run([tool("bruno", async () => result(CONFLICT))], undefined, {
				context: { repoRoot: "/repo", dryRun: true },
			});
			expect(dry.report.status).toBe("fail");
		});

		it("still writes for a provider with no conflict, asking only about those files", async () => {
			const clean = vi.fn(async () => result());
			const confirm = vi.fn(async () => true);
			const { report } = await run(
				[tool("bruno", async () => result(CONFLICT)), tool("postman", clean)],
				undefined,
				{ yes: false, interactive: true, confirm }
			);
			expect(report.status).toBe("fail");
			expect(confirm).toHaveBeenCalledWith("Write 2 file(s) for postman?");
			expect(clean).toHaveBeenCalledTimes(2);
		});
	});

	describe("--prefer", () => {
		it("is handed to the comparison and to the write", async () => {
			const workspace = vi.fn(async (_input: ToolingWorkspaceInput) => result());
			await run([tool("bruno", workspace)], undefined, { prefer: "workspace" });
			expect(workspace.mock.calls.map(([input]) => input.prefer)).toEqual(["workspace", "workspace"]);
		});

		it("is left out when it is not given", async () => {
			const workspace = vi.fn(async (_input: ToolingWorkspaceInput) => result());
			await run([tool("bruno", workspace)]);
			expect(workspace.mock.calls.every(([input]) => !("prefer" in input))).toBe(true);
		});
	});
});
