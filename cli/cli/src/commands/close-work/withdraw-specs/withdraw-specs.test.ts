import { describe, expect, it, vi } from "vitest";

const runSpecsSync = vi.hoisted(() => vi.fn());
const realSpecsSyncIo = vi.hoisted(() => vi.fn(() => ({ io: true })));
vi.mock("../../specs-sync/index.js", () => ({ runSpecsSync, realSpecsSyncIo }));

import { loadedWith } from "../../migrate/migrate.testing.js";
import { withdrawSpecs } from "./withdraw-specs.js";

const loaded = loadedWith({});
const context = { repoRoot: "/r", dryRun: true };

describe("withdrawSpecs", () => {
	it("runs `sync specs --withdraw` for the files, over the repo's own io, and keeps its lines", async () => {
		runSpecsSync.mockResolvedValueOnce({
			status: "dry-run",
			files: [{ path: ".notes/a.spec.md", did: ["would withdraw the post"], text: "" }],
		});
		const result = await withdrawSpecs(loaded, context, [".notes/a.spec.md"]);
		expect(runSpecsSync).toHaveBeenCalledWith(
			expect.objectContaining({ loaded, context, files: [".notes/a.spec.md"], withdraw: true, io: { io: true } })
		);
		expect(realSpecsSyncIo).toHaveBeenCalledWith("/r");
		expect(result).toEqual({ ok: true, detail: "would withdraw the post" });
	});

	it("says the post was already withdrawn when there was nothing to do", async () => {
		runSpecsSync.mockResolvedValueOnce({ status: "ok", files: [{ path: "a", did: [], text: "" }] });
		expect(await withdrawSpecs(loaded, context, ["a"])).toEqual({
			ok: true,
			detail: "the post is already withdrawn",
		});
	});

	it("fails with the run's message, or the files' problems", async () => {
		runSpecsSync.mockResolvedValueOnce({ status: "fail", files: [], message: "no forum" });
		expect(await withdrawSpecs(loaded, context, ["a"])).toEqual({ ok: false, detail: "no forum" });
		runSpecsSync.mockResolvedValueOnce({
			status: "fail",
			files: [{ path: "a", did: [], problem: "rate limited", text: "" }],
		});
		expect(await withdrawSpecs(loaded, context, ["a"])).toEqual({ ok: false, detail: "a: rate limited" });
		runSpecsSync.mockResolvedValueOnce({
			status: "fail",
			files: [
				{ path: "a", did: [], problem: "rate limited", text: "" },
				{ path: "b", did: [], text: "" },
			],
		});
		expect((await withdrawSpecs(loaded, context, ["a", "b"])).detail).toBe("a: rate limited");
		runSpecsSync.mockResolvedValueOnce({ status: "fail", files: [] });
		expect((await withdrawSpecs(loaded, context, ["a"])).detail).toBe("the sync failed");
	});

	it("passes its print so nothing reaches the terminal", async () => {
		runSpecsSync.mockImplementationOnce(async (input: { print: (l: string) => void }) => {
			input.print("a line");
			return { status: "ok", files: [] };
		});
		await expect(withdrawSpecs(loaded, context, ["a"])).resolves.toMatchObject({ ok: true });
	});
});
