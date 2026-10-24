import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout, Source } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { serializeLinks } from "./links.js";
import { pickRoleManager, runNotificationsSyncRoles, sourceProblem } from "./notifications-sync-roles.js";

function loadedFrom(raw: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(raw), filepath: "/tmp/test/holocron.config.json" };
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: () => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

const LAYOUT: NotificationsLayout = { roles: [{ name: "gatekeepers", team: "gatekeepers" }] };
const LINKS = {
	version: 1 as const,
	links: [
		{ github: "1", login: "luke", member: "333" },
		{ github: "2", login: "leia", member: "444" },
	],
};

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		roleMembers: vi.fn(async () => [{ id: "444", name: "leia" }]),
		addRoleMember: vi.fn(async () => {}),
		removeRoleMember: vi.fn(async () => {}),
		...over,
	} as Notifications;
}

function fakeSource(over: Partial<Source> = {}): Source {
	return {
		key: "source",
		providerName: "github",
		teamMembers: vi.fn(async () => [{ id: "1", login: "luke" }]),
		readFile: vi.fn(async () => ({ content: serializeLinks(LINKS), version: "v1" })),
		...over,
	} as unknown as Source;
}

function setup(
	notifications: Notifications,
	source: Source | undefined,
	opts: { dryRun?: boolean; keep?: boolean; provider?: string } = {}
) {
	const loaded = loadedFrom({
		name: "demo",
		providers: { notifications: ["discord"], ...(source ? { source: "github" } : {}) },
	});
	const importer = vi.fn(async (pkg: string) => {
		const modules: Record<string, unknown> = {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
			...(source ? { "@theholocron/holocron-plugin-github": makePlugin("gh", { source }) } : {}),
		};
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	const loader = new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
	const lines: string[] = [];
	return {
		lines,
		run: () =>
			runNotificationsSyncRoles({
				loaded,
				context: { repoRoot: "/tmp/test", org: "theholocron", ...(opts.dryRun ? { dryRun: true } : {}) },
				loader,
				print: (l) => lines.push(l),
				logger: fakeLogger(),
				...(opts.keep ? { keep: true } : {}),
				...(opts.provider ? { provider: opts.provider } : {}),
			}),
	};
}

describe("runNotificationsSyncRoles", () => {
	it("gives the role to a linked team member and takes it from a linked person who left", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, fakeSource());
		const report = await run();
		expect(n.addRoleMember).toHaveBeenCalledWith("gatekeepers", "333");
		expect(n.removeRoleMember).toHaveBeenCalledWith("gatekeepers", "444");
		expect(report.status).toBe("ok");
		expect(report.roles[0]).toMatchObject({ added: ["333"], removed: ["444"] });
		expect(lines.join("\n")).toContain("gave gatekeepers to luke (333)");
		expect(lines.join("\n")).toContain("took gatekeepers from leia (444)");
		expect(lines.at(-1)).toBe("2 ok, 0 fail, 0 skipped");
	});

	it("previews on a dry run without changing anything", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, fakeSource(), { dryRun: true });
		const report = await run();
		expect(n.addRoleMember).not.toHaveBeenCalled();
		expect(n.removeRoleMember).not.toHaveBeenCalled();
		expect(report.status).toBe("dry-run");
		expect(lines.join("\n")).toContain("would give gatekeepers to luke");
	});

	it("--keep gives the role but does not take it away", async () => {
		const n = fakeNotifications();
		const { run, lines } = setup(n, fakeSource(), { keep: true });
		await run();
		expect(n.addRoleMember).toHaveBeenCalled();
		expect(n.removeRoleMember).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("(kept: --keep)");
	});

	it("lists team members who have not linked and holders nobody has linked, and acts on neither", async () => {
		const n = fakeNotifications({
			roleMembers: vi.fn(async () => [{ id: "999", name: "stranger" }, { id: "888" }]),
		});
		const source = fakeSource({
			teamMembers: vi.fn(async () => [
				{ id: "1", login: "luke" },
				{ id: "7", login: "newbie" },
			]),
		});
		const { run, lines } = setup(n, source);
		await run();
		const out = lines.join("\n");
		expect(out).toContain("newbie is on the team but has not linked their account");
		expect(out).toContain("stranger holds gatekeepers but is not linked to anyone: left alone");
		expect(out).toContain("888 holds gatekeepers but is not linked to anyone");
		expect(n.removeRoleMember).not.toHaveBeenCalled();
	});

	it("says so when there are no links yet", async () => {
		const source = fakeSource({ readFile: vi.fn(async () => null) });
		const { run, lines } = setup(fakeNotifications(), source);
		await run();
		expect(lines.join("\n")).toContain("no links yet");
	});

	it("refuses a links file it cannot read, rather than treating it as empty", async () => {
		const source = fakeSource({ readFile: vi.fn(async () => ({ content: "{nope", version: "v" })) });
		const { run } = setup(fakeNotifications(), source);
		const report = await run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("theholocron/.github-private/notifications/discord-links.json");
		expect(report.message).toContain("not valid JSON");
	});

	it("refuses a provider with no layout at all", async () => {
		const report = await setup(fakeNotifications({ layout: undefined }), fakeSource()).run();
		expect(report.message).toContain("declares a `team`");
	});

	it("says how many already have the role", async () => {
		const n = fakeNotifications({ roleMembers: vi.fn(async () => [{ id: "333" }]) });
		const { run, lines } = setup(n, fakeSource());
		await run();
		expect(lines.join("\n")).toContain("1 already have it");
	});

	it("prints to the console and logs through the default logger when none are injected", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"], source: "github" } });
		const modules: Record<string, unknown> = {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: fakeSource() }),
		};
		const loader = new PluginLoader(
			loaded.resolved,
			{ repoRoot: "/tmp/test", org: "theholocron", dryRun: true },
			(async (pkg: string) => modules[pkg]) as unknown as PluginImporter
		);
		await runNotificationsSyncRoles({
			loaded,
			context: { repoRoot: "/tmp/test", org: "theholocron", dryRun: true },
			loader,
		});
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("refuses a role declared for two teams, and asks the team in the resolved org", async () => {
		const twice = fakeNotifications({
			layout: {
				roles: [
					{ name: "gatekeepers", team: "a" },
					{ name: "Gatekeepers", team: "b" },
				],
			},
		});
		expect((await setup(twice, fakeSource()).run()).message).toContain("declared for two teams");
		const source = fakeSource();
		await setup(fakeNotifications(), source).run();
		expect(source.teamMembers).toHaveBeenCalledWith("gatekeepers", "theholocron");
	});

	it("refuses when no role declares a team", async () => {
		const n = fakeNotifications({ layout: { roles: [{ name: "gatekeepers" }] } });
		const report = await setup(n, fakeSource()).run();
		expect(report.message).toContain("declares a `team`");
	});

	it("refuses when the provider cannot manage role members", async () => {
		const n = fakeNotifications({ roleMembers: undefined });
		const report = await setup(n, fakeSource()).run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("manage role members");
	});

	it("refuses without a source provider, or one that cannot list teams or read files", async () => {
		expect((await setup(fakeNotifications(), undefined).run()).message).toContain("`source`");
		expect((await setup(fakeNotifications(), fakeSource({ teamMembers: undefined })).run()).message).toContain(
			"cannot list team members"
		);
		expect((await setup(fakeNotifications(), fakeSource({ readFile: undefined })).run()).message).toContain(
			"cannot read the links file"
		);
	});

	it("reports a failure reading one role and a failure changing one member, and carries on", async () => {
		const failing = fakeNotifications({
			roleMembers: vi.fn(async () => {
				throw new ProviderApiError("boom", 500);
			}),
		});
		const a = await setup(failing, fakeSource()).run();
		expect(a.status).toBe("fail");
		expect(a.failures[0]?.step).toBe("role gatekeepers");

		const refused = fakeNotifications({
			addRoleMember: vi.fn(async () => {
				throw new ProviderApiError("no", 403);
			}),
		});
		const b = await setup(refused, fakeSource()).run();
		expect(b.status).toBe("fail");
		expect(b.failures[0]?.step).toBe("role gatekeepers add luke");
		expect(refused.removeRoleMember).toHaveBeenCalled();
	});

	it("names no provider that can be picked when several cannot", () => {
		expect(() => pickRoleManager([fakeNotifications({ addRoleMember: undefined })])).toThrow();
		expect(pickRoleManager([fakeNotifications()]).providerName).toBe("discord");
	});

	it("sourceProblem accepts a complete source", () => {
		expect(sourceProblem(fakeSource())).toBeUndefined();
	});
});
