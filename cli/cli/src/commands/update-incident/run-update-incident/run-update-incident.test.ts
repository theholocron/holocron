import { describe, expect, it, vi } from "vitest";

const promptConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: promptConfirm }));

import { type PluginLoader, ProviderApiError } from "../../../plugin/index.js";
import { runUpdateIncident } from "./run-update-incident.js";

const page = { name: "The Holocron", slug: "h", components: [] };
const open = {
	id: "i1",
	title: "Sentinel down",
	status: "identified",
	updates: [{ id: "u1", status: "identified", text: "Found it", at: "2026-11-24T10:00:00Z" }],
};

function setup(over: Record<string, unknown> = {}, incidents: unknown[] = [open]) {
	const updateIncident = vi.fn(async () => ({ id: "i1", status: "monitoring" }));
	const resolveIncident = vi.fn(async () => ({ id: "i1", status: "resolved" }));
	const listIncidents = vi.fn(async () => incidents);
	const monitoring = { statusPages: [page], updateIncident, resolveIncident, listIncidents, ...over };
	const loader = {
		load: vi.fn(async () => undefined),
		has: (k: string) => k === "monitoring",
		get: () => monitoring,
		loadedKeys: () => ["monitoring"],
		loadFailures: () => [],
	} as unknown as PluginLoader;
	const lines: string[] = [];
	const base = {
		mode: "update" as const,
		id: "i1",
		status: "monitoring" as const,
		message: "Fix is in",
		loaded: { resolved: {} } as never,
		context: { repoRoot: "/r", dryRun: false },
		loader,
		print: (l: string) => lines.push(l),
		yes: true,
		now: new Date("2026-11-24T12:00:00Z"),
	};
	return { updateIncident, resolveIncident, listIncidents, lines, base };
}

describe("runUpdateIncident (update)", () => {
	it("appends an update with the status and message, subscribers told by default", async () => {
		const { base, updateIncident, listIncidents, lines } = setup();
		expect(await runUpdateIncident(base)).toEqual({ status: "ok" });
		expect(updateIncident).toHaveBeenCalledWith({
			statusPage: "The Holocron",
			id: "i1",
			status: "monitoring",
			message: "Fix is in",
			notify: true,
		});
		expect(listIncidents).toHaveBeenCalledWith({ statusPage: "The Holocron", since: "2026-11-17T12:00:00.000Z" });
		expect(lines.join("\n")).toMatch(
			/appended a monitoring update to "Sentinel down".*it is now monitoring; subscribers will be told/
		);
	});

	it("needs a status and a message, and never resolves", async () => {
		const { base } = setup();
		expect((await runUpdateIncident({ ...base, status: undefined })).reason).toMatch(/needs --status/);
		expect((await runUpdateIncident({ ...base, message: "  " })).reason).toMatch(/needs --message/);
		expect((await runUpdateIncident({ ...base, message: undefined })).reason).toMatch(/needs --message/);
		expect((await runUpdateIncident({ ...base, status: "resolved" as never })).reason).toMatch(
			/use `close incident`/
		);
	});

	it("is a no-op when the newest update already says the same, and appends when only one of the two matches", async () => {
		const { base, updateIncident } = setup();
		const same = await runUpdateIncident({ ...base, status: "identified", message: " Found it " });
		expect(same).toMatchObject({ status: "skip", reason: expect.stringMatching(/already has this update \(u1\)/) });
		expect(updateIncident).not.toHaveBeenCalled();
		expect((await runUpdateIncident({ ...base, status: "identified", message: "Different" })).status).toBe("ok");
		expect(updateIncident).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: "identified", message: "Different" })
		);
		expect((await runUpdateIncident({ ...base, status: "monitoring", message: "Found it" })).status).toBe("ok");
		expect(updateIncident).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: "monitoring", message: "Found it" })
		);
		expect(updateIncident).toHaveBeenCalledTimes(2);
	});

	it("writes on an incident with no updates yet", async () => {
		const { base, updateIncident } = setup({}, [{ ...open, updates: [] }]);
		expect((await runUpdateIncident(base)).status).toBe("ok");
		expect(updateIncident).toHaveBeenCalledWith(expect.objectContaining({ id: "i1", status: "monitoring" }));
	});

	it("refuses an update to a resolved incident, and fails for an unknown one", async () => {
		const resolved = setup({}, [{ ...open, status: "resolved" }]);
		expect((await runUpdateIncident(resolved.base)).reason).toMatch(/must not move it out of resolved/);
		expect(resolved.updateIncident).not.toHaveBeenCalled();
		const none = setup({}, []);
		expect((await runUpdateIncident(none.base)).reason).toMatch(/no incident i1 on "The Holocron"/);
	});

	it("fails when the provider cannot write, cannot read, or the page cannot be picked or read", async () => {
		expect((await runUpdateIncident(setup({ updateIncident: undefined }).base)).reason).toMatch(
			/no `monitoring` provider/
		);
		expect((await runUpdateIncident(setup({ listIncidents: undefined }).base)).reason).toMatch(
			/cannot read incidents/
		);
		const many = setup({ statusPages: [page, { ...page, name: "B" }] });
		expect((await runUpdateIncident(many.base)).reason).toMatch(/name one with --page/);
		expect((await runUpdateIncident({ ...many.base, page: "B" })).status).toBe("ok");
		expect(many.updateIncident).toHaveBeenCalledWith(expect.objectContaining({ statusPage: "B" }));
		const broken = setup();
		broken.listIncidents.mockRejectedValue(new Error("down"));
		expect((await runUpdateIncident(broken.base)).reason).toMatch(/reading the incidents of "The Holocron": down/);
		expect((await runUpdateIncident(setup({ statusPages: undefined }).base)).reason).toMatch(
			/no status page is declared/
		);
		const bare = { ...setup().base.loader, has: () => false } as unknown as PluginLoader;
		expect((await runUpdateIncident({ ...setup().base, loader: bare })).reason).toMatch(/no `monitoring` provider/);
	});

	it("writes nothing on a dry run", async () => {
		const { base, updateIncident, lines } = setup();
		const report = await runUpdateIncident({
			...base,
			yes: false,
			notify: false,
			context: { repoRoot: "/r", dryRun: true },
		});
		expect(report).toEqual({ status: "ok" });
		expect(updateIncident).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/would append a monitoring update.*subscribers will not be told/);
	});

	it("asks first, takes no for an answer, and refuses without a terminal or --yes", async () => {
		const { base, updateIncident } = setup();
		const confirm = vi.fn(async () => false);
		expect((await runUpdateIncident({ ...base, yes: false, interactive: true, confirm })).status).toBe("cancelled");
		expect(updateIncident).not.toHaveBeenCalled();
		expect(
			(await runUpdateIncident({ ...base, yes: false, interactive: true, confirm: async () => true })).status
		).toBe("ok");
		expect(updateIncident).toHaveBeenCalledTimes(1);
		await expect(runUpdateIncident({ ...base, yes: false, interactive: false })).rejects.toThrow(/--yes/);
	});

	it("uses the terminal prompt, the console and the real clock by default", async () => {
		const { base, listIncidents } = setup();
		const { print: _print, now: _now, ...rest } = base;
		promptConfirm.mockResolvedValueOnce(true);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		expect((await runUpdateIncident({ ...rest, yes: false, interactive: true })).status).toBe("ok");
		expect(promptConfirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
		expect(log).toHaveBeenCalled();
		log.mockRestore();
		expect(listIncidents).toHaveBeenCalled();
		const was = process.stdin.isTTY;
		process.stdin.isTTY = false;
		try {
			await expect(runUpdateIncident({ ...base, yes: false })).rejects.toThrow(/--yes/);
		} finally {
			process.stdin.isTTY = was;
		}
	});

	it("reports a failed write, and says a transport failure may have been written", async () => {
		const { base, updateIncident } = setup();
		updateIncident.mockRejectedValueOnce(new ProviderApiError("no", 403));
		expect((await runUpdateIncident(base)).reason).toMatch(/^updating "Sentinel down": /);
		updateIncident.mockRejectedValueOnce(new ProviderApiError("timed out", 0));
		expect((await runUpdateIncident(base)).reason).toMatch(/may or may not have been written/);
	});
});

describe("runUpdateIncident (close)", () => {
	it("resolves with the default message and uses resolveIncident, which takes no status", async () => {
		const { base, resolveIncident, updateIncident, lines } = setup();
		const report = await runUpdateIncident({ ...base, mode: "close", status: undefined, message: undefined });
		expect(report).toEqual({ status: "ok" });
		expect(resolveIncident).toHaveBeenCalledWith({
			statusPage: "The Holocron",
			id: "i1",
			message: "This incident is resolved.",
			notify: true,
		});
		expect(updateIncident).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/^.*close incident/);
	});

	it("takes the message given and --no-notify", async () => {
		const { base, resolveIncident } = setup();
		await runUpdateIncident({ ...base, mode: "close", message: "All clear", notify: false });
		expect(resolveIncident).toHaveBeenCalledWith(expect.objectContaining({ message: "All clear", notify: false }));
	});

	it("does nothing for an incident that is already resolved or whose resolved update is already there", async () => {
		const done = setup({}, [{ ...open, status: "resolved" }]);
		expect((await runUpdateIncident({ ...done.base, mode: "close" })).status).toBe("skip");
		expect(done.resolveIncident).not.toHaveBeenCalled();
		const same = setup({}, [
			{ ...open, updates: [{ id: "u9", status: "resolved", text: "This incident is resolved.", at: "x" }] },
		]);
		expect((await runUpdateIncident({ ...same.base, mode: "close", message: undefined })).reason).toMatch(
			/already has this update \(u9\)/
		);
	});

	it("fails when the provider cannot resolve", async () => {
		const { base } = setup({ resolveIncident: undefined });
		expect((await runUpdateIncident({ ...base, mode: "close" })).reason).toMatch(/no `monitoring` provider/);
	});
});
