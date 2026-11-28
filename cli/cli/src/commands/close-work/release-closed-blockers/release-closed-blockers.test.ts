import { describe, expect, it, vi } from "vitest";

import type { Issues } from "../../../plugin/index.js";
import { record } from "../../migrate/migrate.testing.js";
import { releaseClosedBlockers } from "./release-closed-blockers.js";

const issuesWith = (byKey: Record<string, ReturnType<typeof record>>): Issues =>
	({
		providerName: "github",
		export: vi.fn(async (sel: { keys?: string[] }) =>
			(sel.keys ?? []).flatMap((k) => (byKey[k] ? [byKey[k]] : []))
		),
	}) as unknown as Issues;

const ok = { status: "ok" as const, rows: [] };

describe("releaseClosedBlockers", () => {
	it("takes only the closed blockers off the issue", async () => {
		const issues = issuesWith({
			"#12": record("#12", { blockedBy: ["#3", "#4"] }),
			"#3": record("#3", { closed: true }),
			"#4": record("#4"),
		});
		const unblock = vi.fn(async () => ok);
		const rows = await releaseClosedBlockers({ issues, key: "#12", unblock });
		expect(unblock).toHaveBeenCalledWith(["#3"]);
		expect(rows).toEqual([
			expect.objectContaining({ id: "relations", status: "ok", detail: "closed blocker #3 taken off #12" }),
		]);
	});

	it("treats an issue the provider does not return as having no blockers, and pluralises", async () => {
		const unblock = vi.fn(async () => ok);
		const gone = await releaseClosedBlockers({ issues: issuesWith({}), key: "#12", unblock });
		expect(gone[0]?.detail).toBe("#12 has no blockers");
		const two = await releaseClosedBlockers({
			issues: issuesWith({
				"#12": record("#12", { blockedBy: ["#3", "#4", "#5"] }),
				"#3": record("#3", { closed: true }),
				"#4": record("#4", { closed: true }),
				"#5": record("#5"),
			}),
			key: "#12",
			unblock,
		});
		expect(two[0]?.detail).toBe("closed blockers #3, #4 taken off #12");
		const open = await releaseClosedBlockers({
			issues: issuesWith({
				"#12": record("#12", { blockedBy: ["#4", "#5"] }),
				"#4": record("#4"),
				"#5": record("#5"),
			}),
			key: "#12",
			unblock,
		});
		expect(open[0]?.detail).toBe("2 blockers still open: #4, #5");
	});

	it("changes nothing when no blocker is closed or the issue has none", async () => {
		const unblock = vi.fn(async () => ok);
		const open = await releaseClosedBlockers({
			issues: issuesWith({ "#12": record("#12", { blockedBy: ["#4"] }), "#4": record("#4") }),
			key: "#12",
			unblock,
		});
		expect(open[0]).toMatchObject({ status: "skip", detail: "1 blocker still open: #4" });
		const none = await releaseClosedBlockers({ issues: issuesWith({ "#12": record("#12") }), key: "#12", unblock });
		expect(none[0]?.detail).toBe("#12 has no blockers");
		expect(unblock).not.toHaveBeenCalled();
	});

	it("reports a failed unblock, a provider that cannot read and a read that throws", async () => {
		const failing = await releaseClosedBlockers({
			issues: issuesWith({ "#12": record("#12", { blockedBy: ["#3"] }), "#3": record("#3", { closed: true }) }),
			key: "#12",
			unblock: async () => ({
				status: "fail",
				rows: [{ id: "#12", title: "#12", status: "fail", detail: "refused", problems: [] }],
			}),
		});
		expect(failing.map((r) => r.status)).toEqual(["fail", "fail"]);
		const cannot = await releaseClosedBlockers({
			issues: { providerName: "x" } as unknown as Issues,
			key: "#12",
			unblock: async () => ok,
		});
		expect(cannot[0]?.detail).toContain("cannot read blockers");
		const throws = await releaseClosedBlockers({
			issues: {
				providerName: "x",
				export: async () => {
					throw new Error("down");
				},
			} as unknown as Issues,
			key: "#12",
			unblock: async () => ok,
		});
		expect(throws[0]).toMatchObject({ status: "fail" });
	});
});
