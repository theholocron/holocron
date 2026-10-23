import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { Notifications } from "../../plugin/index.js";
import { type PluginImporter, PluginLoader, ProviderApiError } from "../../plugin/index.js";
import {
	defaultSecretName,
	isReservedSecret,
	pickProvisioner,
	PREFLIGHT_PREFIX,
	provisionChannel,
	runNotificationsChannelAdd,
} from "./notifications-channel-add.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return { resolved: resolveConfig(rawConfig), filepath: "/tmp/test/holocron.config.json" };
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoader(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		send: async () => {},
		ensureChannel: vi.fn(async () => ({ id: "1", created: true })),
		ensureWebhook: vi.fn(async () => ({ created: true, url: "https://hook/secret" })),
		...over,
	} as Notifications;
}

function fakeSecrets() {
	const calls: Array<{ scope: unknown; name: string; value: string }> = [];
	return {
		calls,
		impl: {
			providerName: "github",
			listSecrets: async () => [] as string[],
			setSecret: async (scope: unknown, name: string, value: string) => {
				if (!name.startsWith(PREFLIGHT_PREFIX)) calls.push({ scope, name, value });
			},
			deleteSecret: async () => {},
		},
	};
}

const loadedDemo = () => loadedFrom({ name: "demo", providers: { notifications: ["discord"], secrets: "github" } });

function run(
	notifications: Notifications,
	secrets: ReturnType<typeof fakeSecrets> | undefined,
	input: Partial<Parameters<typeof runNotificationsChannelAdd>[0]> = {}
) {
	const loaded = loadedDemo();
	const lines: string[] = [];
	const loader = makeLoader(loaded, {
		"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications }),
		"@theholocron/holocron-plugin-github": makePlugin("gh", secrets ? { secrets: secrets.impl } : {}),
	});
	const log = fakeLogger();
	return {
		lines,
		log,
		result: runNotificationsChannelAdd({
			loaded,
			context: { repoRoot: "/tmp/test", org: "theholocron" },
			name: "alerts",
			loader,
			print: (l) => lines.push(l),
			logger: log,
			...input,
		}),
	};
}

describe("defaultSecretName", () => {
	it("derives HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>, never naming the provider", () => {
		expect(defaultSecretName("sync")).toBe("HOLOCRON_NOTIFY_WEBHOOK_SYNC");
		expect(defaultSecretName("release-notes")).toBe("HOLOCRON_NOTIFY_WEBHOOK_RELEASE_NOTES");
	});
});

describe("pickProvisioner", () => {
	const a = fakeNotifications({ providerName: "a" });
	const b = fakeNotifications({ providerName: "b" });
	const post = { key: "notifications", providerName: "slack", send: async () => {} } as Notifications;

	it("rejects when no provider can provision", () => {
		expect(() => pickProvisioner([post])).toThrow(/can provision/);
		expect(() => pickProvisioner([])).toThrow(/can provision/);
	});

	it("accepts a role-only provider", () => {
		const rolesOnly = {
			key: "notifications",
			providerName: "r",
			send: async () => {},
			ensureRole: async () => ({ id: "1", created: true }),
		} as Notifications;
		expect(pickProvisioner([rolesOnly])).toBe(rolesOnly);
	});

	it("takes the only capable provider", () => {
		expect(pickProvisioner([post, a])).toBe(a);
	});

	it("asks for --provider when several can", () => {
		expect(() => pickProvisioner([a, b])).toThrow(/pass --provider/);
		expect(pickProvisioner([a, b], "b")).toBe(b);
	});

	it("rejects an unknown --provider", () => {
		expect(() => pickProvisioner([a], "nope")).toThrow(/named `nope` \(have: a\)/);
	});
});

describe("runNotificationsChannelAdd", () => {
	it("creates a channel under a category without touching secrets", async () => {
		const n = fakeNotifications();
		const { result, lines } = run(n, undefined, { category: "ALERTS", topic: "needs a human" });
		const report = await result;
		expect(report).toMatchObject({ status: "ok", channel: { name: "alerts", category: "ALERTS", created: true } });
		expect(n.ensureChannel).toHaveBeenCalledWith({ name: "alerts", category: "ALERTS", topic: "needs a human" });
		expect(n.ensureWebhook).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain("created channel alerts in ALERTS");
	});

	it("reports an existing channel as such", async () => {
		const n = fakeNotifications({ ensureChannel: vi.fn(async () => ({ id: "1", created: false })) });
		const { result, lines } = run(n, undefined);
		expect((await result).channel?.created).toBe(false);
		expect(lines.join("\n")).toContain("exists  channel alerts");
	});

	it("stores a new webhook's URL in an org secret and never prints it", async () => {
		const secrets = fakeSecrets();
		const { result, lines } = run(fakeNotifications(), secrets, { withWebhook: true });
		const report = await result;
		expect(secrets.calls).toEqual([
			{
				scope: { kind: "organization", name: "theholocron" },
				name: "HOLOCRON_NOTIFY_WEBHOOK_ALERTS",
				value: "https://hook/secret",
			},
		]);
		expect(report.channel?.webhook).toEqual({
			name: "alerts",
			created: true,
			secret: "HOLOCRON_NOTIFY_WEBHOOK_ALERTS",
			stored: true,
		});
		expect(lines.join("\n")).not.toContain("https://hook/secret");
	});

	it("honours --webhook-name, --secret and --scope", async () => {
		const secrets = fakeSecrets();
		const n = fakeNotifications();
		const { result } = run(n, secrets, {
			withWebhook: true,
			webhookName: "repo-sync",
			secret: "MY_SECRET",
			scope: { kind: "repo" },
		});
		await result;
		expect(n.ensureWebhook).toHaveBeenCalledWith({ channel: "alerts", name: "repo-sync" });
		expect(secrets.calls[0]).toMatchObject({ scope: { kind: "repo" }, name: "MY_SECRET" });
	});

	it("fails, storing nothing and saying why, when an existing webhook's URL cannot be read", async () => {
		const secrets = fakeSecrets();
		const n = fakeNotifications({ ensureWebhook: vi.fn(async () => ({ created: false })) });
		const { result, lines } = run(n, secrets, { withWebhook: true });
		const report = await result;
		expect(secrets.calls).toEqual([]);
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/cannot be read back/);
		expect(report.channel?.webhook).toMatchObject({ stored: false, created: false });
		expect(lines.join("\n")).toContain("cannot be read back");
	});

	it("previews without calling the provider on --dry-run", async () => {
		const n = fakeNotifications();
		const { result, lines } = run(n, fakeSecrets(), {
			withWebhook: true,
			category: "ALERTS",
			context: { repoRoot: "/tmp/test", org: "theholocron", dryRun: true },
		});
		const secrets = fakeSecrets();
		expect((await result).status).toBe("dry-run");
		expect(n.ensureChannel).not.toHaveBeenCalled();
		expect(n.ensureWebhook).not.toHaveBeenCalled();
		expect(secrets.calls).toEqual([]);
		expect(lines.join("\n")).toContain(
			"would ensure webhook alerts and store its URL in HOLOCRON_NOTIFY_WEBHOOK_ALERTS"
		);
	});

	it("previews a plain channel on --dry-run", async () => {
		const { result, lines } = run(fakeNotifications(), undefined, {
			context: { repoRoot: "/tmp/test", dryRun: true },
		});
		expect((await result).channel).toEqual({ name: "alerts", created: false });
		expect(lines.join("\n")).toContain("would ensure channel alerts");
	});

	it("returns fail, not a throw, when the provider errors", async () => {
		const n = fakeNotifications({
			ensureChannel: vi.fn(async () => {
				throw new Error("Missing Permissions");
			}),
		});
		const { result, log } = run(n, undefined);
		expect(await result).toMatchObject({ status: "fail", message: "Missing Permissions" });
		expect(log.warn).toHaveBeenCalled();
	});

	it("fails when the provider cannot create webhooks", async () => {
		const n = fakeNotifications({ ensureWebhook: undefined });
		const { result } = run(n, fakeSecrets(), { withWebhook: true });
		expect((await result).message).toMatch(/cannot create webhooks/);
		// ...and it said so BEFORE creating the channel, so nothing is left behind.
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("fails when a webhook was asked for but no secrets provider is configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
		});
		const lines: string[] = [];
		const report = await runNotificationsChannelAdd({
			loaded,
			context: { repoRoot: "/tmp/test", org: "theholocron" },
			name: "x",
			withWebhook: true,
			loader,
			print: (l) => lines.push(l),
		});
		expect(report).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/needs a `secrets` capability/),
		});
		expect(lines.join("\n")).toContain("✗");
	});

	it("fails before touching anything when there is no org or scope for the secret", async () => {
		const { result } = run(fakeNotifications(), fakeSecrets(), {
			withWebhook: true,
			context: { repoRoot: "/tmp/test" },
		});
		expect(await result).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/no org to store the webhook secret/),
		});
	});

	it("fails, with a printed reason, when no notifications provider is configured at all", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { secrets: "github" } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { secrets: fakeSecrets().impl }),
		});
		const report = await runNotificationsChannelAdd({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "x",
			loader,
			print: () => {},
		});
		expect(report).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/no `notifications` provider is available/),
		});
	});

	it("explains why the secrets provider is missing when it failed to load", async () => {
		const loaded = loadedDemo();
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
		});
		const report = await runNotificationsChannelAdd({
			loaded,
			context: { repoRoot: "/tmp/test", org: "theholocron" },
			name: "x",
			withWebhook: true,
			loader,
			print: () => {},
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/needs a `secrets` capability .*failed to load: .*holocron-plugin-github/);
	});

	it("needs no secrets provider and no org to preview a webhook on --dry-run", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { notifications: ["discord"] } });
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
		});
		const lines: string[] = [];
		const report = await runNotificationsChannelAdd({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			name: "x",
			withWebhook: true,
			loader,
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("dry-run");
		expect(lines.join("\n")).toContain("would ensure webhook x");
	});

	it("refuses a webhook request up front, even on --dry-run, when the provider cannot create webhooks", async () => {
		const n = fakeNotifications({ ensureWebhook: undefined });
		const { result } = run(n, fakeSecrets(), {
			withWebhook: true,
			context: { repoRoot: "/tmp/test", org: "theholocron", dryRun: true },
		});
		expect(await result).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/cannot create webhooks/),
		});
	});

	it("passes the category through so the webhook lands on the right channel", async () => {
		const n = fakeNotifications();
		const { result } = run(n, fakeSecrets(), { withWebhook: true, category: "AUTOMATION", name: "sync" });
		await result;
		expect(n.ensureWebhook).toHaveBeenCalledWith({ channel: "sync", name: "sync", category: "AUTOMATION" });
	});

	it("tells the user how to recover when the webhook was created but the secret write failed", async () => {
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async (_scope: unknown, name: string) => {
					if (!name.startsWith(PREFLIGHT_PREFIX)) throw new Error("403 Resource not accessible");
				},
				deleteSecret: async () => {},
			},
		};
		const { result } = run(fakeNotifications(), secrets as unknown as ReturnType<typeof fakeSecrets>, {
			withWebhook: true,
		});
		const report = await result;
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(
			/was created but storing its URL in HOLOCRON_NOTIFY_WEBHOOK_ALERTS failed .*403.*delete the webhook/
		);
	});

	it("fails before creating the channel when a real run has no secrets provider loaded", async () => {
		const n = fakeNotifications();
		const secretless = loadedFrom({ name: "demo", providers: { notifications: ["discord"], secrets: "github" } });
		const loader = makeLoader(secretless, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: n }),
		});
		await runNotificationsChannelAdd({
			loaded: secretless,
			context: { repoRoot: "/tmp/test", org: "theholocron" },
			name: "x",
			withWebhook: true,
			loader,
			print: () => {},
		});
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("fails when the provider can only manage roles and a channel is asked for", async () => {
		const n = fakeNotifications({
			ensureChannel: undefined,
			ensureRole: vi.fn(async () => ({ id: "1", created: true })),
		});
		const { result } = run(n, undefined);
		expect(await result).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/cannot create channels/),
		});
	});

	it("reports a found webhook as found when its URL is stored again", async () => {
		const secrets = fakeSecrets();
		const n = fakeNotifications({
			ensureWebhook: vi.fn(async () => ({ created: false, url: "https://hook/again" })),
		});
		const { result, lines } = run(n, secrets, { withWebhook: true });
		expect((await result).status).toBe("ok");
		expect(secrets.calls[0]?.value).toBe("https://hook/again");
		expect(lines.join("\n")).toContain("found   webhook alerts; URL stored in HOLOCRON_NOTIFY_WEBHOOK_ALERTS");
	});

	it("words a failed secret write for an existing webhook as 'found', not 'created'", async () => {
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async (_scope: unknown, name: string) => {
					if (!name.startsWith(PREFLIGHT_PREFIX)) throw new Error("boom");
				},
				deleteSecret: async () => {},
			},
		};
		const n = fakeNotifications({
			ensureWebhook: vi.fn(async () => ({ created: false, url: "https://hook/again" })),
		});
		const { result } = run(n, secrets as unknown as ReturnType<typeof fakeSecrets>, { withWebhook: true });
		expect((await result).message).toMatch(/webhook alerts was found but storing its URL/);
	});

	it("prints to the console when no print function is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const loaded = loadedDemo();
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-discord": makePlugin("discord", { notifications: fakeNotifications() }),
		});
		await runNotificationsChannelAdd({ loaded, context: { repoRoot: "/tmp/test" }, name: "x", loader });
		expect(log).toHaveBeenCalledWith(expect.stringContaining("notifications channel add — x"));
		log.mockRestore();
	});
});

describe("provisionChannel", () => {
	it("refuses a real webhook request when no secrets provider was resolved", async () => {
		const n = fakeNotifications();
		await expect(
			provisionChannel(
				{ notifications: n, scope: { kind: "repo" }, dryRun: false, print: () => {} },
				{ name: "alerts", webhook: {} }
			)
		).rejects.toThrow(/needs a `secrets` provider/);
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("checks the secrets store before creating anything, so a bad token leaves no orphan webhook", async () => {
		const n = fakeNotifications();
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async () => {
					throw new ProviderApiError(
						"GitHub PUT /orgs/theholocron/actions/secrets/x → 403",
						403,
						'{"message":"Resource not accessible"}'
					);
				},
				deleteSecret: async () => {},
			},
		};
		const { result } = run(n, secrets as unknown as ReturnType<typeof fakeSecrets>, { withWebhook: true });
		const report = await result;
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/cannot write to the secrets store for organization theholocron/);
		expect(report.message).toContain("Resource not accessible");
		expect(n.ensureChannel).not.toHaveBeenCalled();
		expect(n.ensureWebhook).not.toHaveBeenCalled();
	});

	it("shows the provider's response body, not just the status, when a step fails", async () => {
		const n = fakeNotifications({
			ensureChannel: vi.fn(async () => {
				throw new ProviderApiError(
					"Discord PATCH /channels/1 → 403",
					403,
					'{"message":"Missing Permissions","code":50013}'
				);
			}),
		});
		const { result } = run(n, undefined);
		expect((await result).message).toBe(
			'Discord PATCH /channels/1 → 403: {"message":"Missing Permissions","code":50013}'
		);
	});

	it("does not check the secrets store on --dry-run", async () => {
		const setSecret = vi.fn(async () => {});
		const secrets = {
			calls: [],
			impl: { providerName: "github", listSecrets: async () => [], setSecret, deleteSecret: async () => {} },
		};
		const { result } = run(fakeNotifications(), secrets as unknown as ReturnType<typeof fakeSecrets>, {
			withWebhook: true,
			context: { repoRoot: "/tmp/test", org: "theholocron", dryRun: true },
		});
		await result;
		expect(setSecret).not.toHaveBeenCalled();
	});

	it("names a non-organization scope plainly when the secrets store is unreachable", async () => {
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async () => {
					throw new Error("nope");
				},
				deleteSecret: async () => {},
			},
		};
		const { result } = run(fakeNotifications(), secrets as unknown as ReturnType<typeof fakeSecrets>, {
			withWebhook: true,
			scope: { kind: "repo" },
		});
		expect((await result).message).toMatch(/cannot write to the secrets store for repo \(nope\)/);
	});

	it("proves write access with a throwaway secret that it removes, before creating any channel", async () => {
		const order: string[] = [];
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async (_s: unknown, name: string) => void order.push(`set ${name}`),
				deleteSecret: async (_s: unknown, name: string) => void order.push(`delete ${name}`),
			},
		};
		const n = fakeNotifications({
			ensureChannel: vi.fn(async () => {
				order.push("channel");
				return { id: "1", created: true };
			}),
		});
		const { result } = run(n, secrets as unknown as ReturnType<typeof fakeSecrets>, { withWebhook: true });
		await result;
		const probe = order[0]!.replace(/^set /, "");
		expect(probe).toMatch(/^HOLOCRON_NOTIFY_PREFLIGHT_[0-9A-F]{8}$/);
		expect(order.slice(0, 3)).toEqual([`set ${probe}`, `delete ${probe}`, "channel"]);
	});

	it("fails before creating anything when the throwaway secret cannot be removed", async () => {
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async () => {},
				deleteSecret: async () => {
					throw new Error("delete refused");
				},
			},
		};
		const n = fakeNotifications();
		const { result } = run(n, secrets as unknown as ReturnType<typeof fakeSecrets>, { withWebhook: true });
		expect(await result).toMatchObject({ status: "fail", message: expect.stringMatching(/delete refused/) });
		expect(n.ensureChannel).not.toHaveBeenCalled();
	});

	it("keeps the provider's response body out of the structured log while still showing it to the user", async () => {
		const n = fakeNotifications({
			ensureChannel: vi.fn(async () => {
				throw new ProviderApiError("Discord PATCH /channels/1 → 403", 403, '{"message":"Missing Permissions"}');
			}),
		});
		const { result, log, lines } = run(n, undefined);
		const report = await result;
		expect(report.message).toContain("Missing Permissions");
		expect(lines.join("\n")).toContain("Missing Permissions");
		expect(JSON.stringify(log.warn.mock.calls)).not.toContain("Missing Permissions");
		expect(JSON.stringify(log.warn.mock.calls)).toContain("Discord PATCH /channels/1 → 403");
	});

	it("uses a different throwaway name every run, so it can never overwrite and delete an existing secret", async () => {
		const names = new Set<string>();
		for (let i = 0; i < 5; i++) {
			const secrets = {
				calls: [],
				impl: {
					providerName: "github",
					listSecrets: async () => [] as string[],
					setSecret: async (_s: unknown, name: string) => void names.add(name),
					deleteSecret: async () => {},
				},
			};
			await run(fakeNotifications(), secrets as unknown as ReturnType<typeof fakeSecrets>, { withWebhook: true })
				.result;
		}
		const probes = [...names].filter((n) => n.startsWith(PREFLIGHT_PREFIX));
		expect(probes).toHaveLength(5);
		expect(probes).not.toContain(PREFLIGHT_PREFIX);
	});

	it("tells the user the probe's name when it cannot be removed", async () => {
		const secrets = {
			calls: [],
			impl: {
				providerName: "github",
				listSecrets: async () => [] as string[],
				setSecret: async () => {},
				deleteSecret: async () => {
					throw new Error("delete refused");
				},
			},
		};
		const { result } = run(fakeNotifications(), secrets as unknown as ReturnType<typeof fakeSecrets>, {
			withWebhook: true,
		});
		expect((await result).message).toMatch(
			/If a secret named HOLOCRON_NOTIFY_PREFLIGHT_[0-9A-F]{8} was left behind, delete it/
		);
	});

	it("refuses --secret under the reserved preflight prefix", async () => {
		const n = fakeNotifications();
		const { result } = run(n, fakeSecrets(), { withWebhook: true, secret: "holocron_notify_preflight_x" });
		expect(await result).toMatchObject({
			status: "fail",
			message: expect.stringMatching(/reserved for the setup preflight/),
		});
		expect(n.ensureWebhook).not.toHaveBeenCalled();
	});
});

describe("isReservedSecret", () => {
	it("matches the preflight prefix case-insensitively and nothing else", () => {
		expect(isReservedSecret("HOLOCRON_NOTIFY_PREFLIGHT")).toBe(true);
		expect(isReservedSecret("holocron_notify_preflight_abcd1234")).toBe(true);
		expect(isReservedSecret("HOLOCRON_NOTIFY_WEBHOOK_SYNC")).toBe(false);
		expect(isReservedSecret("MY_HOLOCRON_NOTIFY_PREFLIGHT")).toBe(false);
	});

	it("names the plugin's own load error when the configured notifications plugin fails to load", async () => {
		const loaded = loadedDemo();
		const loader = makeLoader(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { secrets: fakeSecrets().impl }),
			"@theholocron/holocron-plugin-discord": {
				createPlugin: () => {
					throw new Error("no Discord webhook URL found");
				},
			},
		});
		const report = await runNotificationsChannelAdd({
			loaded,
			context: { repoRoot: "/tmp/test" },
			name: "x",
			loader,
			print: () => {},
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(
			/no `notifications` provider is available.*`discord` failed to load: no Discord webhook URL found/
		);
	});
});
