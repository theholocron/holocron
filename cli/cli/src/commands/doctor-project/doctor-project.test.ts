import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import type { BoardItem, Projects } from "../../plugin/index.js";
import {
	board,
	fakeProjects,
	loadedWith,
	loaderWith,
	memoryIo,
	roadmapState,
} from "../project/testing/fake-projects.js";
import { runDoctorProject } from "./doctor-project.js";
import type { RunDoctorProjectInput } from "./doctor-project.type.js";

const BOARDS = [{ template: "roadmap", name: "v5" }];
const withBoards = (boards: unknown = BOARDS) => ({ projects: ["github", { boards }] });

async function run(
	providers: Record<string, unknown>,
	caps: Record<string, unknown>,
	extra: Partial<RunDoctorProjectInput> = {}
) {
	const lines: string[] = [];
	const loaded = loadedWith(providers);
	const report = await runDoctorProject({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(loaded, caps),
		io: memoryIo(),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
		...extra,
	});
	return { report, text: lines.join("\n") };
}

const v5 = board("v5");
const item = (over: Partial<BoardItem>): BoardItem => ({
	key: "#1",
	title: "an item",
	open: true,
	status: "Todo",
	category: "planned",
	blockedBy: [],
	...over,
});
const healthy = (over: Partial<Projects> = {}) =>
	fakeProjects({
		find: vi.fn(async () => v5),
		read: vi.fn(async () => roadmapState(v5)),
		items: vi.fn(async () => [item({})]),
		...over,
	});

describe("doctor project: the board", () => {
	it("passes when the board matches its template and no item needs a status", async () => {
		const { report, text } = await run(withBoards(), { projects: healthy() });
		expect(report.status).toBe("ok");
		expect(report.summary.fail).toBe(0);
		expect(text).toContain("v5: board exists and is open");
		expect(text).toContain("v5: statuses");
		expect(text).toContain("v5: field Priority");
		expect(text).toContain("v5: view Active");
		expect(text).toContain("v5: rule Auto-add sub-issues to project");
	});

	it("fails when no open board has the name", async () => {
		const { report, text } = await run(withBoards(), { projects: fakeProjects() });
		expect(report.status).toBe("fail");
		expect(text).toContain("no open board has this name");
	});

	it("says when the board is closed", async () => {
		const closed = board("v5", { closed: true });
		const { report, text } = await run(withBoards(), {
			projects: fakeProjects({ list: vi.fn(async () => [closed]) }),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("the board is closed");
	});

	it("fails on a status that is missing and on statuses out of order", async () => {
		const missing = await run(withBoards(), {
			projects: healthy({ read: vi.fn(async () => roadmapState(v5, { statuses: ["Someday", "Todo", "Done"] })) }),
		});
		expect(missing.report.status).toBe("fail");
		expect(missing.text).toContain("missing status In Progress");
		expect(missing.text).toContain("missing status Blocked");

		const order = await run(withBoards(), {
			projects: healthy({
				read: vi.fn(async () =>
					roadmapState(v5, { statuses: ["Todo", "Someday", "In Progress", "Blocked", "Done"] })
				),
			}),
		});
		expect(order.report.status).toBe("fail");
		expect(order.text).toContain("statuses are in the order Todo, Someday");
	});

	it("fails on a field that is missing, of another type, or with options missing or out of order", async () => {
		const state = roadmapState(v5, {
			fields: [{ name: "Priority", type: "text", options: ["2 · Next", "1 · Now"] }],
		});
		const { report, text } = await run(withBoards(), {
			projects: healthy({ read: vi.fn(async () => state) }),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("type is text, declared single_select");
		expect(text).toContain("missing option 3 · Process");

		const none = await run(withBoards(), {
			projects: healthy({ read: vi.fn(async () => roadmapState(v5, { fields: [] })) }),
		});
		expect(none.report.status).toBe("fail");
		expect(none.text).toContain("missing field Priority");

		const order = await run(withBoards(), {
			projects: healthy({
				read: vi.fn(async () =>
					roadmapState(v5, {
						fields: [
							{
								name: "Priority",
								type: "single_select",
								options: ["2 · Next", "1 · Now", "3 · Process"],
							},
						],
					})
				),
			}),
		});
		expect(order.text).toContain("options are in the order");
	});

	it("fails on a view that is missing, with another layout or another filter", async () => {
		const state = roadmapState(v5, {
			views: [
				{ name: "Active", layout: "table", filter: "status:Todo" },
				{ name: "Done", layout: "table", filter: "status:Done" },
			],
		});
		const { report, text } = await run(withBoards(), { projects: healthy({ read: vi.fn(async () => state) }) });
		expect(report.status).toBe("fail");
		expect(text).toContain("layout is table, declared board");
		expect(text).toContain("filter is status:Todo, declared -status:Someday -status:Done");
		expect(text).toContain("missing view Backlog");
	});

	it("does not compare a filter the template does not set", async () => {
		const state = roadmapState(v5);
		const projects = healthy({ read: vi.fn(async () => state) });
		const { text } = await run(withBoards([{ template: "sprint", name: "v5" }]), { projects });
		expect(text).not.toContain("declared undefined");
	});

	it("fails on a rule that is missing or off", async () => {
		const off = await run(withBoards(), {
			projects: healthy({
				read: vi.fn(async () =>
					roadmapState(v5, { rules: [{ name: "Auto-add sub-issues to project", enabled: false }] })
				),
			}),
		});
		expect(off.report.status).toBe("fail");
		expect(off.text).toContain("rule Auto-add sub-issues to project is off");

		const gone = await run(withBoards(), {
			projects: healthy({ read: vi.fn(async () => roadmapState(v5, { rules: [] })) }),
		});
		expect(gone.text).toContain("missing rule Auto-add sub-issues to project");
	});

	it("reports what the board has beyond the template as info and never fails on it", async () => {
		const state = roadmapState(v5, {
			statuses: ["Someday", "Todo", "In Progress", "Blocked", "Done", "Parked"],
			fields: [...roadmapState(v5).fields, { name: "Size", type: "number" }],
			views: [...roadmapState(v5).views, { name: "Mine", layout: "table" }],
		});
		const { report, text } = await run(withBoards(), { projects: healthy({ read: vi.fn(async () => state) }) });
		expect(report.status).toBe("ok");
		expect(text).toContain("v5: extra statuses");
		expect(text).toContain("- Parked");
		expect(text).toContain("- Size");
		expect(text).toContain("- Mine");
		expect(text).toContain("info: 1 status(es) not in the template (never deleted)");
	});

	it("fails the board's row when the provider throws", async () => {
		const { report, text } = await run(withBoards(), {
			projects: fakeProjects({ find: vi.fn().mockRejectedValue(new Error("bad credentials")) }),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("bad credentials");
	});

	it("fails when the declared template does not exist", async () => {
		const { report, text } = await run(withBoards([{ template: "nope", name: "v5" }]), { projects: healthy() });
		expect(report.status).toBe("fail");
		expect(text).toContain("template nope");
	});

	it("checks every declared board", async () => {
		const find = vi.fn(async (_owner: string, name: string) => board(name));
		const { text } = await run(
			withBoards([
				{ template: "roadmap", name: "v5" },
				{ template: "roadmap", name: "v6" },
			]),
			{ projects: healthy({ find, read: vi.fn(async (_o, b) => roadmapState(b)) }) }
		);
		expect(text).toContain("v5: board exists and is open");
		expect(text).toContain("v6: board exists and is open");
	});
});

describe("doctor project: the items", () => {
	const bad = (items: BoardItem[]) => run(withBoards(), { projects: healthy({ items: vi.fn(async () => items) }) });

	it("is ok on each item rule when nothing is wrong", async () => {
		const { text } = await bad([item({})]);
		expect(text).toMatch(/v5: item without a status\s+none/);
		expect(text).toMatch(/v5: blocked item with no open blocker\s+none/);
	});

	it("reports an item without a status, as info", async () => {
		const { report, text } = await bad([
			item({ key: "#7", title: "orphan", status: undefined, category: undefined }),
		]);
		expect(report.status).toBe("ok");
		expect(text).toContain("info: 1 item(s); `project reconcile` fixes this");
		expect(text).toContain("- #7 orphan");
	});

	it("reports a closed item that is not in a done status", async () => {
		const { text } = await bad([item({ key: "#8", open: false, status: "Todo", category: "planned" })]);
		expect(text).toContain("closed item not in a done status");
		expect(text).toContain("- #8 an item");
	});

	it("does not report a closed item that is done", async () => {
		const { text } = await bad([item({ open: false, status: "Done", category: "done" })]);
		expect(text).toMatch(/closed item not in a done status\s+none/);
	});

	it("reports an open item with an open blocker that is not in a blocked status", async () => {
		const { report, text } = await bad([item({ key: "#9", blockedBy: ["#2"] })]);
		expect(report.status).toBe("ok");
		expect(text).toContain("open item with an open blocker but not in a blocked status");
		expect(text).toContain("- #9 an item");
	});

	it("reports a blocked item with no open blocker, and not one that is blocked by an open issue", async () => {
		const flagged = await bad([item({ key: "#10", status: "Blocked", category: "blocked" })]);
		expect(flagged.text).toContain("- #10 an item");
		const fine = await bad([item({ status: "Blocked", category: "blocked", blockedBy: ["#2"] })]);
		expect(fine.text).toMatch(/blocked item with no open blocker\s+none/);
	});

	it("skips the item rows when the provider cannot list items", async () => {
		const { report, text } = await run(withBoards(), { projects: healthy({ items: undefined }) });
		expect(report.status).toBe("ok");
		expect(text).toContain("the provider cannot list a board's items");
	});
});

describe("doctor project: what it cannot check", () => {
	it("skips with the reason when there is no projects provider", async () => {
		const { report } = await run({}, {});
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no `projects` provider is configured");
	});

	it("skips when no board is declared", async () => {
		const { report } = await run({ projects: "github" }, { projects: healthy() });
		expect(report.status).toBe("skip");
		expect(report.reason).toContain("no boards are declared");
	});

	it("fails with every problem when the options do not read", async () => {
		const { report, text } = await run(withBoards("nope"), { projects: healthy() });
		expect(report.status).toBe("fail");
		expect(text).toContain("providers.projects options are not valid");
		expect(text).toContain("boards must be a list");
	});

	it("fails a template file that is wrong, naming the file, and still checks the boards", async () => {
		const { report, text } = await run(
			withBoards(),
			{ projects: healthy() },
			{ io: memoryIo({ "broken.json": "{ nope" }) }
		);
		expect(report.status).toBe("fail");
		expect(text).toContain("template file broken.json");
		expect(text).toContain("broken.json: not valid JSON");
		expect(text).toContain("v5: board exists and is open");
	});

	it("uses a template file of the repo", async () => {
		const file = JSON.stringify({ extends: "roadmap", fields: [{ name: "Size", type: "number" }] });
		const { text } = await run(
			withBoards([{ template: "custom", name: "v5" }]),
			{ projects: healthy() },
			{ io: memoryIo({ "custom.json": file }) }
		);
		expect(text).toContain("missing field Size");
	});
});

describe("doctor project --post", () => {
	const failing = fakeProjects();

	it("posts the failing rows through the notifications provider", async () => {
		const postMessage = vi.fn().mockResolvedValue(undefined);
		const { text } = await run(
			{ ...withBoards(), notifications: ["discord"] },
			{ projects: failing, notifications: { providerName: "discord", postMessage } },
			{ post: "alerts" }
		);
		expect(postMessage).toHaveBeenCalledTimes(1);
		const [channel, content] = postMessage.mock.calls[0] as [string, string];
		expect(channel).toBe("alerts");
		expect(content).toContain("`holocron doctor project`");
		expect(content).toContain("v5: board exists and is open");
		expect(text).toContain("posted to #alerts");
	});

	it("posts only the summary when nothing failed", async () => {
		const postMessage = vi.fn().mockResolvedValue(undefined);
		await run(
			{ ...withBoards(), notifications: ["discord"] },
			{ projects: healthy(), notifications: { providerName: "discord", postMessage } },
			{ post: "alerts" }
		);
		expect((postMessage.mock.calls[0] as [string, string])[1]).not.toContain("v5:");
	});

	it("says so when there is no notifications provider", async () => {
		const { text } = await run(withBoards(), { projects: failing }, { post: "alerts" });
		expect(text).toContain("not posted: no `notifications` provider is configured");
	});

	it("says so when the provider cannot post, and still reports the run", async () => {
		const { report, text } = await run(
			{ ...withBoards(), notifications: ["discord"] },
			{ projects: failing, notifications: { providerName: "discord" } },
			{ post: "alerts" }
		);
		expect(report.status).toBe("fail");
		expect(text).toContain("cannot post a message as the bot");
	});

	it("falls back to the console, its own plugin loader and the repo's templates when none are injected", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			const report = await runDoctorProject({
				loaded: loadedWith({}),
				context: { repoRoot: "/tmp/holocron-no-such-repo" },
				logger: fakeLogger(),
			});
			expect(report.status).toBe("skip");
			expect(report.reason).toContain("no `projects` provider is configured");
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});

	it("logs through the default logger when none is injected", async () => {
		const loaded = loadedWith({});
		const report = await runDoctorProject({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader: loaderWith(loaded, {}),
			io: memoryIo(),
			print: () => undefined,
		});
		expect(report.status).toBe("skip");
	});

	it("posts nothing without --post", async () => {
		const postMessage = vi.fn();
		await run(
			{ ...withBoards(), notifications: ["discord"] },
			{ projects: failing, notifications: { providerName: "discord", postMessage } }
		);
		expect(postMessage).not.toHaveBeenCalled();
	});
});
