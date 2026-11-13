import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runIssueCreate } from "./run-issue-create.js";
import type { RunIssueCreateInput } from "./run-issue-create.type.js";

const issuesFake = (create: (input: unknown) => Promise<{ key: string }> = async () => ({ key: "#9" })) => ({
	create: vi.fn(create),
});

async function run(
	options: Partial<RunIssueCreateInput> & { issues?: ReturnType<typeof issuesFake> | null; configured?: boolean } = {}
) {
	const { issues = issuesFake(), configured = true, ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith();
	const report = await runIssueCreate({
		title: "Fix the thing",
		loaded: {
			...base,
			resolved: {
				...base.resolved,
				providers: !configured ? {} : { issues: { cardinality: "single", tuple: { provider: "github" } } },
			} as never,
		},
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader(issues ? { issues } : {}),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n"), issues };
}

describe("runIssueCreate", () => {
	it("files the issue through the provider and reports its key", async () => {
		const { report, text, issues } = await run({
			body: "It breaks.",
			labels: ["bug", " bug ", ""],
			milestone: "v4.0",
		});
		expect(issues!.create).toHaveBeenCalledWith({
			summary: "Fix the thing",
			body: "It breaks.",
			labels: ["bug"],
			milestone: "v4.0",
		});
		expect(report).toMatchObject({ status: "ok", key: "#9" });
		expect(text).toContain("filed #9");
		expect(text).toContain("1 ok, 0 fail, 0 skipped");
	});

	it("leaves out a body, labels and milestone that were not given", async () => {
		const { issues } = await run({ body: "  ", labels: [], milestone: " " });
		expect(issues!.create).toHaveBeenCalledWith({ summary: "Fix the thing" });
	});

	it("previews on --dry-run and files nothing", async () => {
		const { report, text, issues } = await run({
			context: { repoRoot: "/r", dryRun: true },
			body: "a\nb",
			labels: ["x"],
		});
		expect(issues!.create).not.toHaveBeenCalled();
		expect(report).toMatchObject({ status: "ok" });
		expect(report.key).toBeUndefined();
		expect(text).toContain("would file the issue (labels: x)");
		expect(text).toContain("dry-run");
	});

	it("asks first, and files nothing when the answer is no", async () => {
		const confirm = vi.fn(async () => false);
		const { report, text, issues } = await run({ yes: false, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith('File "Fix the thing"?');
		expect(report.status).toBe("cancelled");
		expect(issues!.create).not.toHaveBeenCalled();
		expect(text).toContain("nothing was filed");
	});

	it("files after a yes", async () => {
		const { report } = await run({ yes: false, interactive: true, confirm: async () => true });
		expect(report).toMatchObject({ status: "ok", key: "#9" });
	});

	it("refuses to ask without a terminal", async () => {
		const err = await run({ yes: false, interactive: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/--yes/);
	});

	it("fails on an empty title, a missing provider config and an unavailable provider", async () => {
		expect((await run({ title: "  " })).text).toContain("the title is empty");
		expect((await run({ configured: false })).text).toContain("no `issues` provider");
		const none = await run({ issues: null });
		expect(none.report.status).toBe("fail");
		expect(none.text).toContain("not available");
	});

	it("says why the provider is not available when the loader recorded a reason", async () => {
		const { report, text } = await run({ loader: fakeLoader({}, { issues: "no token" }) });
		expect(report.status).toBe("fail");
		expect(text).toContain("not available (no token)");
	});

	it("previews an issue with no text, labels or milestone", async () => {
		const { text } = await run({ context: { repoRoot: "/r", dryRun: true } });
		expect(text).toContain("would file the issue\n");
	});

	it("asks with the inquirer prompt by default, and reads whether stdin is a terminal", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
		Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
		try {
			const { report } = await run({ yes: false });
			expect(inquirerConfirm).toHaveBeenCalledWith({ message: 'File "Fix the thing"?', default: false });
			expect(report.status).toBe("ok");
			Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
			const err = await run({ yes: false }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
		} finally {
			if (tty) Object.defineProperty(process.stdin, "isTTY", tty);
			else delete (process.stdin as { isTTY?: boolean }).isTTY;
		}
	});

	it("turns a provider error into a failing row", async () => {
		const { report, text } = await run({
			issues: issuesFake(async () => {
				throw new Error("403 Forbidden");
			}),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not file the issue");
		expect(text).toContain("403 Forbidden");
	});
});
