import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications, NotificationsLayout, Source } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import { parseLinks, serializeLinks } from "../notifications-sync-roles/links.js";
import { runNotificationsLink } from "./notifications-link.js";

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
const SIGNED_IN = { member: "333", name: "Luke", github: { id: "55", login: "luke-gh" } };

function fakeNotifications(over: Partial<Notifications> = {}, who: unknown = SIGNED_IN): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		layout: LAYOUT,
		signIn: () => ({
			authorizeUrl: vi.fn(
				async ({ redirectUri, state }) => `https://discord.test/authorize?r=${redirectUri}&s=${state}`
			),
			complete: vi.fn(async () => who),
		}),
		...over,
	} as unknown as Notifications;
}

function fakeSource(
	files: { current: { content: string; version: string } | null },
	over: Partial<Source> = {}
): Source {
	return {
		key: "source",
		providerName: "github",
		readFile: vi.fn(async () => files.current),
		writeFile: vi.fn(async (_path: string, content: string) => {
			files.current = { content, version: "next" };
		}),
		...over,
	} as unknown as Source;
}

const hostedDown = (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch;

function setup(
	notifications: Notifications,
	source: Source | undefined,
	opts: {
		dryRun?: boolean;
		fetch?: typeof fetch;
		waitForCode?: () => Promise<string>;
		openBrowser?: () => Promise<void>;
	} = {}
) {
	const loaded = loadedFrom({
		name: "demo",
		providers: { notifications: ["discord"], ...(source ? { source: "github" } : {}) },
	});
	const modules: Record<string, unknown> = {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		...(source ? { "@theholocron/holocron-plugin-github": makePlugin("gh", { source }) } : {}),
	};
	const loader = new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, (async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg];
	}) as unknown as PluginImporter);
	const lines: string[] = [];
	const open = opts.openBrowser ?? vi.fn(async () => {});
	return {
		lines,
		open,
		run: () =>
			runNotificationsLink({
				loaded,
				context: { repoRoot: "/tmp/test", org: "theholocron", ...(opts.dryRun ? { dryRun: true } : {}) },
				loader,
				print: (l) => lines.push(l),
				logger: fakeLogger(),
				fetch: opts.fetch ?? hostedDown,
				waitForCode: opts.waitForCode
					? opts.waitForCode
					: async ({ onListening }) => {
							onListening();
							return "the-code";
						},
				openBrowser: open,
				newState: () => "state1",
			}),
	};
}

describe("runNotificationsLink", () => {
	it("signs in locally and writes the link to the links file", async () => {
		const files = { current: null as { content: string; version: string } | null };
		const source = fakeSource(files);
		const { run, lines, open } = setup(fakeNotifications(), source);
		const report = await run();
		expect(report).toMatchObject({
			status: "ok",
			via: "local",
			linked: { github: "55", member: "333", changed: true },
		});
		expect(parseLinks(files.current!.content).links).toEqual([{ github: "55", login: "luke-gh", member: "333" }]);
		expect(source.writeFile).toHaveBeenCalledWith(
			"notifications/discord-links.json",
			expect.any(String),
			expect.objectContaining({ repo: "theholocron/.github-private" })
		);
		expect(open).toHaveBeenCalledWith(expect.stringContaining("state1"));
		const out = lines.join("\n");
		expect(out).toContain("runs on this machine");
		expect(out).toContain("OAuth2 → Redirects");
		expect(out).toContain("linked luke-gh (github 55) to Luke (333)");
	});

	it("replaces an earlier link for the same account and keeps the version it read", async () => {
		const files = {
			current: {
				content: serializeLinks({ version: 1, links: [{ github: "55", login: "old", member: "999" }] }),
				version: "v7",
			},
		};
		const source = fakeSource(files);
		await setup(fakeNotifications(), source).run();
		expect(source.writeFile).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({ version: "v7" })
		);
		expect(parseLinks(files.current.content).links.map((l) => l.member)).toEqual(["333"]);
	});

	it("says it is already linked and writes nothing", async () => {
		const files = {
			current: {
				content: serializeLinks({ version: 1, links: [{ github: "55", login: "luke-gh", member: "333" }] }),
				version: "v1",
			},
		};
		const source = fakeSource(files);
		const { run, lines } = setup(fakeNotifications(), source);
		const report = await run();
		expect(report.linked?.changed).toBe(false);
		expect(source.writeFile).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("already linked");
	});

	it("reads again and retries once when someone else wrote in between", async () => {
		const files = { current: null as { content: string; version: string } | null };
		let first = true;
		const source = fakeSource(files, {
			writeFile: vi.fn(async (_p: string, content: string) => {
				if (first) {
					first = false;
					throw new ProviderApiError("conflict", 409);
				}
				files.current = { content, version: "next" };
			}),
		} as Partial<Source>);
		const report = await setup(fakeNotifications(), source).run();
		expect(report.status).toBe("ok");
		expect(source.writeFile).toHaveBeenCalledTimes(2);
	});

	it("fails when the conflict repeats, or the write fails for another reason", async () => {
		const files = { current: null as { content: string; version: string } | null };
		const conflict = fakeSource(files, {
			writeFile: vi.fn(async () => {
				throw new ProviderApiError("conflict", 409);
			}),
		} as Partial<Source>);
		expect((await setup(fakeNotifications(), conflict).run()).status).toBe("fail");
		expect(conflict.writeFile).toHaveBeenCalledTimes(2);
		const denied = fakeSource(files, {
			writeFile: vi.fn(async () => {
				throw new ProviderApiError("no", 403);
			}),
		} as Partial<Source>);
		expect((await setup(fakeNotifications(), denied).run()).status).toBe("fail");
		expect(denied.writeFile).toHaveBeenCalledTimes(1);
	});

	it("refuses a member with no verified GitHub account, saying how to fix it", async () => {
		const source = fakeSource({ current: null });
		const report = await setup(fakeNotifications({}, { member: "333", name: "Luke" }), source).run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("no verified GitHub account");
		expect(report.message).toContain("Connections");
		expect(source.writeFile).not.toHaveBeenCalled();
	});

	it("refuses a links file it cannot read", async () => {
		const source = fakeSource({ current: { content: "{nope", version: "v" } });
		const report = await setup(fakeNotifications(), source).run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("not valid JSON");
	});

	it("points at the hosted service when it answers, and signs nobody in here", async () => {
		const up = (async () => Response.json({ service: "link" })) as unknown as typeof fetch;
		const source = fakeSource({ current: null });
		const wait = vi.fn();
		const layout: NotificationsLayout = { ...LAYOUT, links: { hostedUrl: "https://sentinel.example" } };
		const { run, lines } = setup(fakeNotifications({ layout }), source, { fetch: up, waitForCode: wait });
		const report = await run();
		expect(report).toMatchObject({ status: "ok", via: "hosted" });
		expect(wait).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("https://sentinel.example/api/link/start");
	});

	it("says why it signs in here when the hosted service is down", async () => {
		const layout: NotificationsLayout = {
			...LAYOUT,
			links: { hostedUrl: "https://sentinel.example", localPort: 4000 },
		};
		const { run, lines } = setup(fakeNotifications({ layout }), fakeSource({ current: null }));
		await run();
		expect(lines.join("\n")).toContain("answered 402");
		expect(lines.join("\n")).toContain("http://localhost:4000/callback");
	});

	it("previews on a dry run: no sign-in, no write, and the portal step", async () => {
		const source = fakeSource({ current: null });
		const wait = vi.fn();
		const { run, lines } = setup(fakeNotifications(), source, { dryRun: true, waitForCode: wait });
		const report = await run();
		expect(report.status).toBe("dry-run");
		expect(wait).not.toHaveBeenCalled();
		expect(source.writeFile).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("OAuth2 → Redirects");
	});

	it("carries on, with the link printed, when no browser can be opened", async () => {
		const open = vi.fn(async () => {
			throw new Error("no display");
		});
		const { run, lines } = setup(fakeNotifications(), fakeSource({ current: null }), { openBrowser: open });
		await run();
		await new Promise((r) => setTimeout(r, 0));
		expect(lines.join("\n")).toContain("could not open a browser");
	});

	it("fails with the reason when the sign-in does not come back", async () => {
		const report = await setup(fakeNotifications(), fakeSource({ current: null }), {
			waitForCode: async () => {
				throw new Error("timed out waiting for the sign-in to come back");
			},
		}).run();
		expect(report.status).toBe("fail");
		expect(report.message).toContain("timed out");
	});

	it("refuses a provider that cannot sign members in, or a missing or read-only source", async () => {
		expect(
			(await setup(fakeNotifications({ signIn: undefined }), fakeSource({ current: null })).run()).message
		).toContain("sign members in");
		expect((await setup(fakeNotifications(), undefined).run()).message).toContain("`source`");
		expect(
			(
				await setup(
					fakeNotifications(),
					fakeSource({ current: null }, { writeFile: undefined } as Partial<Source>)
				).run()
			).message
		).toContain("read and write files");
	});

	it("names a member by id when the provider gave no display name", async () => {
		const files = { current: null as { content: string; version: string } | null };
		const source = fakeSource(files);
		const noName = { member: "333", github: { id: "55", login: "luke-gh" } };
		const { run, lines } = setup(fakeNotifications({}, noName), source);
		await run();
		expect(lines.join("\n")).toContain("to 333 (333)");
		const refused = await setup(fakeNotifications({}, { member: "333" }), fakeSource({ current: null })).run();
		expect(refused.message).toContain("333 has no verified GitHub account");
	});

	it("uses the default links repo when the provider declares no layout", async () => {
		const { layout: _layout, ...bare } = fakeNotifications() as unknown as Record<string, unknown>;
		const source = fakeSource({ current: null });
		const report = await setup(bare as unknown as Notifications, source).run();
		expect(report.status).toBe("ok");
		expect(source.writeFile).toHaveBeenCalledWith(
			"notifications/discord-links.json",
			expect.any(String),
			expect.objectContaining({ repo: "theholocron/.github-private" })
		);
	});

	it("refuses without an org or links repo to put the file in", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"], source: "github" } });
		const modules: Record<string, unknown> = {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: fakeSource({ current: null }) }),
		};
		const loader = new PluginLoader(
			loaded.resolved,
			{ repoRoot: "/tmp/test" },
			(async (pkg: string) => modules[pkg]) as unknown as PluginImporter
		);
		const lines: string[] = [];
		const report = await runNotificationsLink({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(report.message).toContain("no org");
	});
});
