import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import { type Issues, type IssueTypeInfo, ProviderApiError } from "../../../plugin/index.js";
import { ensureIssueTypes, MAX_ISSUE_TYPES } from "./ensure-issue-types.js";
import type { EnsureIssueTypesInput } from "./ensure-issue-types.type.js";

const BUG: IssueTypeInfo = { id: 1, name: "Bug", description: "A fault", color: "red", enabled: true };
const TASK: IssueTypeInfo = { id: 2, name: "task", description: "Work", color: "yellow", enabled: false };

interface Fake {
	issues: Issues;
	create: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
}

function fake(list: IssueTypeInfo[] | null | Error = [BUG, TASK], overrides: Partial<Issues> = {}): Fake {
	const create = vi.fn(async (t: { name: string }) => ({ id: 9, name: t.name, enabled: true }));
	const update = vi.fn(async () => {});
	const issues = {
		providerName: "github",
		listTypes: async () => {
			if (list instanceof Error) throw list;
			return list ?? undefined;
		},
		createType: create,
		updateType: update,
		...overrides,
	} as unknown as Issues;
	return { issues, create, update };
}

const declared = [{ name: "Bug" }, { name: "Epic", description: "Several issues", color: "purple" }, { name: "Spike" }];

const run = (f: Fake | undefined, extra: Partial<EnsureIssueTypesInput> = {}) =>
	ensureIssueTypes({
		declared,
		issues: f?.issues,
		caller: "apply",
		update: false,
		yes: true,
		...extra,
	});

const detail = (r: Awaited<ReturnType<typeof run>>) => r.rows.map((x) => `${x.status} ${x.title} ${x.detail}`);

describe("ensureIssueTypes", () => {
	it("makes the missing Types in declaration order and leaves the rest", async () => {
		const f = fake();
		const r = await run(f);
		expect(f.create.mock.calls.map((c) => c[0])).toEqual([
			{ name: "Epic", description: "Several issues", color: "purple" },
			{ name: "Spike" },
		]);
		expect(f.update).not.toHaveBeenCalled();
		expect(r.status).toBe("ok");
		expect(r.created).toEqual(["Epic", "Spike"]);
		expect(detail(r)).toEqual(["ok Bug exists", "ok Epic created", "ok Spike created"]);
	});

	it("is a no-op the second time and writes nothing", async () => {
		const f = fake([BUG, { id: 3, name: "epic", enabled: true }, { id: 4, name: "SPIKE", enabled: false }]);
		const r = await run(f);
		expect(f.create).not.toHaveBeenCalled();
		expect(r.status).toBe("ok");
		expect(detail(r)).toEqual([
			"ok Bug exists",
			"ok Epic exists",
			"ok Spike exists (turned off in the organization)",
		]);
	});

	it("skips with no declaration", async () => {
		for (const none of [undefined, []]) {
			const r = await run(fake(), { declared: none });
			expect(r.status).toBe("skip");
			expect(r.rows[0]?.detail).toMatch(/no issueTypes declared/);
		}
	});

	it("reports a missing issues provider, with the reason, per caller", async () => {
		expect((await run(undefined)).status).toBe("fail");
		const r = await run(undefined, { caller: "setup", missingReason: "no `issues` provider (x failed to load)" });
		expect(r.status).toBe("skip");
		expect(r.rows[0]?.detail).toContain("x failed to load");
	});

	it("says a provider without Types has none", async () => {
		const r = await run(fake([], { listTypes: undefined }));
		expect(r.status).toBe("skip");
		expect(r.rows[0]?.detail).toContain("has no issue Types");
		expect((await run(fake([], { createType: undefined }))).status).toBe("skip");
	});

	it("is a failure (apply) or a skip (setup) when the list cannot be read", async () => {
		expect((await run(fake(null))).status).toBe("fail");
		expect((await run(fake(null), { caller: "setup" })).status).toBe("skip");
		const refused = await run(fake(new ProviderApiError("no", 403)));
		expect(refused.status).toBe("fail");
		expect(refused.rows[0]?.detail).toContain("Issue types: read");
		const other = await run(fake(new Error("boom")), { caller: "setup" });
		expect(other.status).toBe("skip");
		expect(other.rows[0]?.detail).toContain("boom");
	});

	it("stops before any write when existing plus new is over 25", async () => {
		const many = Array.from({ length: MAX_ISSUE_TYPES - 1 }, (_, i) => ({ id: i, name: `T${i}`, enabled: true }));
		const f = fake(many);
		const r = await run(f);
		expect(f.create).not.toHaveBeenCalled();
		expect(r.status).toBe("fail");
		expect(r.rows[0]?.detail).toMatch(/24 Types exist and 3 more would be made: 27 is over the limit of 25/);
		expect((await run(fake(many), { caller: "setup" })).status).toBe("skip");
	});

	it("allows exactly 25", async () => {
		const many = Array.from({ length: MAX_ISSUE_TYPES - 3 }, (_, i) => ({ id: i, name: `T${i}`, enabled: true }));
		const f = fake(many);
		await run(f);
		expect(f.create).toHaveBeenCalledTimes(3);
	});

	it("does not fail on the limit when nothing is to be made", async () => {
		const many = Array.from({ length: 30 }, (_, i) => ({ id: i, name: i === 0 ? "Bug" : `T${i}`, enabled: true }));
		expect((await run(fake(many), { declared: [{ name: "Bug" }] })).status).toBe("ok");
	});

	describe("--dry-run", () => {
		it("reads and says what it would do", async () => {
			const f = fake();
			const r = await run(f, {
				dryRun: true,
				update: true,
				declared: [...declared, { name: "Task", description: "New words" }],
			});
			expect(f.create).not.toHaveBeenCalled();
			expect(f.update).not.toHaveBeenCalled();
			expect(detail(r)).toEqual([
				"ok Bug exists",
				"skip Epic would create",
				"skip Spike would create",
				"skip Task would update description",
			]);
			expect(r.rows[3]?.problems).toEqual(['description: was "Work", to "New words"']);
			expect(r).toMatchObject({ status: "ok", created: ["Epic", "Spike"], updated: ["Task"] });
		});

		it("never asks", async () => {
			const confirm = vi.fn();
			await run(fake(), { dryRun: true, yes: false, interactive: false, confirm });
			expect(confirm).not.toHaveBeenCalled();
		});
	});

	describe("--update", () => {
		it("sets the description and colour that differ, by id", async () => {
			const f = fake();
			const r = await run(f, {
				update: true,
				declared: [
					{ name: "Bug", description: "A fault", color: "orange", enabled: false },
					{ name: "Task", description: "Work done" },
				],
			});
			expect(f.update.mock.calls).toEqual([
				[1, { color: "orange" }],
				[2, { description: "Work done" }],
			]);
			expect(f.create).not.toHaveBeenCalled();
			expect(r.updated).toEqual(["Bug", "Task"]);
			expect(detail(r)).toEqual(["ok Bug updated color", "ok Task updated description"]);
		});

		it("leaves a differing Type alone without it", async () => {
			const f = fake();
			await run(f, { declared: [{ name: "Bug", color: "blue" }] });
			expect(f.update).not.toHaveBeenCalled();
		});
	});

	describe("asking first", () => {
		it("lists every change and writes on a yes", async () => {
			const f = fake();
			const confirm = vi.fn(async () => true);
			const r = await run(f, { yes: false, interactive: true, confirm });
			expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/would create Epic\n.*would create Spike/));
			expect(r.created).toEqual(["Epic", "Spike"]);
		});

		it("changes nothing on a no", async () => {
			const f = fake();
			const r = await run(f, { yes: false, interactive: true, confirm: async () => false });
			expect(f.create).not.toHaveBeenCalled();
			expect(r.status).toBe("cancelled");
			expect(r.rows[0]?.detail).toContain("nothing was changed");
		});

		it("uses the inquirer prompt by default", async () => {
			inquirerConfirm.mockResolvedValueOnce(false);
			const r = await run(fake(), { yes: false, interactive: true });
			expect(inquirerConfirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
			expect(r.status).toBe("cancelled");
		});

		it("throws NonInteractiveError for apply with no terminal and no --yes", async () => {
			const err = await run(fake(), { yes: false, interactive: false }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
			expect((err as Error).message).toMatch(/pass --yes/);
		});

		it("is a skip row for setup, so the other steps go on", async () => {
			const f = fake();
			const r = await run(f, { caller: "setup", yes: false, interactive: false });
			expect(f.create).not.toHaveBeenCalled();
			expect(r.status).toBe("skip");
			expect(r.rows[0]?.detail).toContain("pass --yes");
		});

		it("does not ask when nothing is to be done", async () => {
			const confirm = vi.fn();
			await run(fake(), { declared: [{ name: "Bug" }], yes: false, interactive: false, confirm });
			expect(confirm).not.toHaveBeenCalled();
		});

		it("reads stdin for a terminal when not told", async () => {
			const tty = process.stdin.isTTY;
			process.stdin.isTTY = false;
			try {
				const err = await run(fake(), { yes: false }).catch((e: unknown) => e);
				expect(err).toBeInstanceOf(NonInteractiveError);
			} finally {
				process.stdin.isTTY = tty;
			}
		});
	});

	describe("a failing write", () => {
		it("reads a 409 or 422 as exists when the name is now in the list, one more read", async () => {
			const lists = [[BUG], [BUG, { id: 5, name: "epic", enabled: true }]];
			const listTypes = vi.fn(async () => lists.shift());
			const f = fake([], { listTypes });
			f.create.mockRejectedValueOnce(new ProviderApiError("exists", 422));
			const r = await run(f, { declared: [{ name: "Epic" }] });
			expect(listTypes).toHaveBeenCalledTimes(2);
			expect(detail(r)).toEqual(["ok Epic exists (made in the meantime)"]);
			expect(r.created).toEqual([]);
		});

		it("is a failing row when a conflict is not a name that exists, or the re-read fails", async () => {
			const f = fake([BUG]);
			f.create.mockRejectedValue(new ProviderApiError("bad color", 422, "color invalid"));
			const r = await run(f, { declared: [{ name: "Epic" }, { name: "Spike" }] });
			expect(r.status).toBe("fail");
			expect(r.rows.map((x) => x.status)).toEqual(["fail", "fail"]);
			expect(f.create).toHaveBeenCalledTimes(2);

			let calls = 0;
			const g = fake([], {
				listTypes: async () => {
					if (calls++ > 0) throw new Error("gone");
					return [];
				},
			});
			g.create.mockRejectedValueOnce(new ProviderApiError("x", 409));
			expect((await run(g, { declared: [{ name: "Epic" }] })).status).toBe("fail");
		});

		it("goes on after another error and reports it", async () => {
			const f = fake([BUG]);
			f.create.mockRejectedValueOnce(new Error("boom"));
			const r = await run(f, { declared: [{ name: "Epic" }, { name: "Spike" }] });
			expect(detail(r)).toEqual(["fail Epic boom", "ok Spike created"]);
			expect(r.status).toBe("fail");
		});

		it("stops cleanly at a rate limit and lists what is left", async () => {
			const f = fake([BUG]);
			f.create.mockRejectedValueOnce(new ProviderApiError("slow down", 429));
			const r = await run(f, { declared: [{ name: "Bug" }, { name: "Epic" }, { name: "Spike" }] });
			expect(f.create).toHaveBeenCalledTimes(1);
			expect(detail(r)).toEqual([
				"ok Bug exists",
				"fail Epic rate limited: stopped; run it again to finish",
				"skip Spike left: stopped at a rate limit",
			]);
			expect(r.status).toBe("fail");
		});

		it("names the missing permission on a refusal and writes no more (apply: fail, setup: skip)", async () => {
			const f = fake([BUG]);
			f.create.mockRejectedValue(new ProviderApiError("Forbidden", 403));
			const r = await run(f, { declared: [{ name: "Epic" }, { name: "Spike" }] });
			expect(f.create).toHaveBeenCalledTimes(1);
			expect(r.status).toBe("fail");
			expect(r.rows[0]?.detail).toContain("Issue types: write");
			expect(r.rows[1]?.detail).toContain("not written");

			const g = fake([BUG]);
			g.create.mockRejectedValue(new ProviderApiError("Forbidden", 401));
			const s = await run(g, { caller: "setup", declared: [{ name: "Epic" }, { name: "Spike" }] });
			expect(s.status).toBe("skip");
		});

		it("fails a refused update the same way", async () => {
			const f = fake();
			f.update.mockRejectedValue(new ProviderApiError("Forbidden", 403));
			const r = await run(f, { update: true, declared: [{ name: "Bug", color: "blue" }] });
			expect(r.status).toBe("fail");
		});

		it("tolerates a provider with no updateType", async () => {
			const f = fake([BUG], { updateType: undefined });
			const r = await run(f, { update: true, declared: [{ name: "Bug", color: "blue" }] });
			expect(r.status).toBe("ok");
		});
	});
});
