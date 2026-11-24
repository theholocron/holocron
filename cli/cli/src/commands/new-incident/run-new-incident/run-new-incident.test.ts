import { describe, expect, it, vi } from "vitest";

const promptConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: promptConfirm }));

import { type PluginLoader, ProviderApiError } from "../../../plugin/index.js";
import { runNewIncident } from "./run-new-incident.js";

const page = { name: "The Holocron", slug: "h", components: [{ name: "Sentinel" }, { name: "Docs" }] };

function setup(over: Record<string, unknown> = {}, notifications: unknown[] = []) {
	const openIncident = vi.fn(async () => ({ id: "i1", status: "investigating" }));
	const listIncidents = vi.fn(async () => []);
	const monitoring = { statusPages: [page], openIncident, listIncidents, ...over };
	const loader = {
		load: vi.fn(async () => undefined),
		has: (k: string) => (k === "monitoring" ? monitoring !== undefined : k === "notifications"),
		get: (k: string) => (k === "monitoring" ? monitoring : notifications),
		loadedKeys: () => ["monitoring"],
		loadFailures: () => [],
	} as unknown as PluginLoader;
	const lines: string[] = [];
	const base = {
		title: "Sentinel down",
		loaded: { resolved: {} } as never,
		context: { repoRoot: "/r", dryRun: false },
		loader,
		print: (l: string) => lines.push(l),
		yes: true,
		now: new Date("2026-11-24T12:00:00Z"),
	};
	return { openIncident, listIncidents, lines, base };
}

const feed = [
	{ layout: { categories: [{ name: "c", channels: [{ name: "incidents", feeds: { incidents: true } }] }] } },
];

describe("runNewIncident", () => {
	it("opens an incident with the impacts, the default message and subscribers told", async () => {
		const { openIncident, base, lines } = setup({}, feed);
		const report = await runNewIncident({ ...base, components: ["Sentinel=major"] });
		expect(report).toEqual({ status: "ok", id: "i1" });
		expect(openIncident).toHaveBeenCalledWith({
			statusPage: "The Holocron",
			title: "Sentinel down",
			status: "investigating",
			message: "We are investigating.",
			notify: true,
			impacts: [{ component: "Sentinel", impact: "major" }],
		});
		expect(lines.join("\n")).toMatch(
			/opened "Sentinel down" on "The Holocron" as investigating \(i1\); subscribers will be told/
		);
		expect(lines.join("\n")).not.toMatch(/mirrored/);
	});

	it("takes the status, message and --no-notify as given, and the default message follows the status", async () => {
		const { openIncident, base } = setup();
		await runNewIncident({ ...base, status: "identified", message: "Found it", notify: false });
		expect(openIncident).toHaveBeenCalledWith(
			expect.objectContaining({ status: "identified", message: "Found it", notify: false })
		);
		await runNewIncident({ ...base, status: "monitoring" });
		expect(openIncident).toHaveBeenLastCalledWith(
			expect.objectContaining({ message: expect.stringMatching(/monitoring/) })
		);
	});

	it("refuses an empty title, a resolved opening status and a missing provider method", async () => {
		const { base } = setup();
		expect((await runNewIncident({ ...base, title: "  " })).status).toBe("fail");
		const resolved = await runNewIncident({ ...base, status: "resolved" as never });
		expect(resolved.reason).toMatch(/not "resolved"/);
		const none = setup({ openIncident: undefined });
		expect((await runNewIncident(none.base)).reason).toMatch(/no `monitoring` provider that opens/);
	});

	it("fails for a page it cannot pick and for components that do not parse, before writing", async () => {
		const many = setup({ statusPages: [page, { ...page, name: "Other" }] });
		expect((await runNewIncident(many.base)).reason).toMatch(/2 status pages are declared/);
		expect((await runNewIncident({ ...many.base, page: "Other" })).status).toBe("ok");
		expect(many.openIncident).toHaveBeenCalledWith(expect.objectContaining({ statusPage: "Other" }));
		const bad = setup();
		const report = await runNewIncident({ ...bad.base, components: ["Nope=major", "Docs=huge"] });
		expect(report.status).toBe("fail");
		expect(bad.lines).toHaveLength(2);
		expect(bad.openIncident).not.toHaveBeenCalled();
	});

	it("refuses an open incident of the same title, and --allow-duplicate opens it anyway", async () => {
		const { base, openIncident, listIncidents } = setup();
		listIncidents.mockResolvedValue([
			{ id: "x", title: " SENTINEL  down", status: "identified" },
			{ id: "y", title: "Sentinel down", status: "resolved" },
		] as never);
		const refused = await runNewIncident(base);
		expect(refused.reason).toMatch(/already open on "The Holocron" \(x\)/);
		// Only the open incidents (and today's) are read, never the whole history.
		expect(listIncidents).toHaveBeenCalledWith({ statusPage: "The Holocron", since: "2026-11-24T12:00:00.000Z" });
		expect(openIncident).not.toHaveBeenCalled();
		expect((await runNewIncident({ ...base, allowDuplicate: true })).status).toBe("ok");
		expect(openIncident).toHaveBeenCalledTimes(1);
		expect(openIncident).toHaveBeenCalledWith(expect.objectContaining({ title: "Sentinel down" }));
		expect(listIncidents).toHaveBeenCalledTimes(1);
	});

	it("opens again when only a resolved incident has the title", async () => {
		const { base, listIncidents, openIncident } = setup();
		listIncidents.mockResolvedValue([{ id: "y", title: "Sentinel down", status: "resolved" }] as never);
		expect((await runNewIncident(base)).status).toBe("ok");
		expect(openIncident).toHaveBeenCalledWith(expect.objectContaining({ title: "Sentinel down" }));
	});

	it("says the duplicate check was not possible when the provider cannot list, and fails when the list fails", async () => {
		const noList = setup({ listIncidents: undefined });
		expect((await runNewIncident(noList.base)).status).toBe("ok");
		expect(noList.openIncident).toHaveBeenCalledTimes(1);
		expect(noList.lines.join("\n")).toMatch(/cannot list incidents/);
		const broken = setup();
		broken.listIncidents.mockRejectedValue(new Error("down"));
		expect((await runNewIncident(broken.base)).reason).toMatch(
			/reading the open incidents of "The Holocron": down/
		);
	});

	it("writes nothing on a dry run and says what it would do and where it will not be mirrored", async () => {
		const { base, openIncident, lines } = setup();
		const report = await runNewIncident({ ...base, yes: false, context: { repoRoot: "/r", dryRun: true } });
		expect(report).toEqual({ status: "ok" });
		expect(openIncident).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(
			/would open "Sentinel down" on "The Holocron" as investigating \(no component\); subscribers will be told/
		);
		expect(lines.join("\n")).toMatch(/no forum has `feeds.incidents`/);
	});

	it("asks first, and does nothing on no", async () => {
		const { base, openIncident } = setup();
		const confirm = vi.fn(async () => false);
		const report = await runNewIncident({ ...base, yes: false, interactive: true, confirm, notify: false });
		expect(report.status).toBe("cancelled");
		expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/subscribers will not be told/));
		expect(openIncident).not.toHaveBeenCalled();
		const yes = await runNewIncident({ ...base, yes: false, interactive: true, confirm: async () => true });
		expect(yes.status).toBe("ok");
		expect(openIncident).toHaveBeenCalledTimes(1);
	});

	it("refuses to run without a terminal and without --yes", async () => {
		const { base } = setup();
		await expect(runNewIncident({ ...base, yes: false, interactive: false })).rejects.toThrow(/--yes/);
	});

	it("reports a failed write, and says a transport failure may have been written", async () => {
		const { base, openIncident } = setup();
		openIncident.mockRejectedValueOnce(new ProviderApiError("nope", 403, "no"));
		expect((await runNewIncident(base)).reason).toMatch(/^opening "Sentinel down": /);
		openIncident.mockRejectedValueOnce(new ProviderApiError("timed out", 0));
		expect((await runNewIncident(base)).reason).toMatch(/may or may not have been written/);
	});

	it("asks through the terminal prompt by default, and prints to the console", async () => {
		const { base } = setup();
		promptConfirm.mockResolvedValueOnce(true);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const { print: _print, now: _now, ...rest } = base;
		const report = await runNewIncident({ ...rest, yes: false, interactive: true });
		expect(report.status).toBe("ok");
		expect(promptConfirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("reads whether stdin is a terminal when not told", async () => {
		const { base } = setup();
		const was = process.stdin.isTTY;
		process.stdin.isTTY = false;
		try {
			await expect(runNewIncident({ ...base, yes: false })).rejects.toThrow(/--yes/);
		} finally {
			process.stdin.isTTY = was;
		}
	});

	it("fails for a provider with no declared pages and works with no notifications provider loaded", async () => {
		const none = setup({ statusPages: undefined });
		expect((await runNewIncident(none.base)).reason).toMatch(/no status page is declared/);
		const { base } = setup();
		const bare = { ...base.loader, has: (k: string) => k === "monitoring" } as unknown as PluginLoader;
		expect((await runNewIncident({ ...base, loader: bare })).status).toBe("ok");
	});

	it("fails with no monitoring provider at all, and a dry run of a mirrored page has no note", async () => {
		const { base } = setup();
		const none = { ...base.loader, has: () => false } as unknown as PluginLoader;
		expect((await runNewIncident({ ...base, loader: none })).reason).toMatch(/no `monitoring` provider/);
		const mirrored = setup({}, feed);
		await runNewIncident({ ...mirrored.base, yes: false, context: { repoRoot: "/r", dryRun: true } });
		expect(mirrored.lines.join("\n")).not.toMatch(/mirrored/);
	});
});
