import { stripVTControlCharacters } from "node:util";

import { beforeEach, describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));
const readEntryValues = vi.hoisted(() => vi.fn());
vi.mock("../read-entry-values/index.js", () => ({ readEntryValues }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { Tooling, ToolingOpenPlan } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { MARKER, runOpenRequests } from "./run-open-requests.js";
import type { OpenRequestsDeps, PathState, RunOpenRequestsInput } from "./run-open-requests.type.js";

const ROOT = "/repo";
const SECRETS = "/repo/.holocron/.private/requests.env";
const LOCK = "/repo/.holocron/.private/open-requests.lock";
const SENTINEL = "/repo/.bruno/collections/sentinel/.env";
const COMLINK = "/repo/.bruno/collections/comlink/.env";
const OPTIONS = { collectionFiles: ["api/a.collection.json"], envFiles: ["api/a.environment.json"] };
const VALUE = "super-secret-value-123";

const PLAN: ToolingOpenPlan = {
	app: "Bruno",
	wants: [
		{
			collection: "collections/sentinel",
			variable: "webhookSecret",
			layer: "dev",
			entry: "SENTINEL_WEBHOOK_SECRET",
			name: "DEV_SENTINEL_WEBHOOK_SECRET",
		},
		{
			collection: "collections/sentinel",
			variable: "webhookSecret",
			layer: "prod",
			entry: "SENTINEL_WEBHOOK_SECRET",
			name: "PROD_SENTINEL_WEBHOOK_SECRET",
		},
		{
			collection: "collections/comlink",
			variable: "sentrySecret",
			layer: "dev",
			entry: "COMLINK_SENTRY_SECRET",
			name: "DEV_COMLINK_SENTRY_SECRET",
		},
	],
	unfilled: [],
	targets: [SENTINEL, COMLINK],
	launch: { command: "/Applications/Bruno.app/Contents/MacOS/Bruno", args: ["/repo/.bruno"] },
	running: "/Applications/Bruno.app/Contents/MacOS/Bruno",
};

const tool = (name: string, open?: Tooling["open"]): Tooling =>
	({ key: "tooling", providerName: name, sync: vi.fn(), doctor: vi.fn(), ...(open ? { open } : {}) }) as Tooling;

const vault = (over: Record<string, unknown> = {}) => ({
	providerName: "1password",
	readEnvironmentEntries: vi.fn(),
	...over,
});

/** An in-memory file system, a lock, a process list and a program that records what was there while it ran. */
function fakeDeps(over: Partial<OpenRequestsDeps> = {}) {
	const state = new Map<string, PathState>();
	const texts = new Map<string, string>();
	const during: { text?: string; links: string[] } = { links: [] };
	let lockHeld = false;
	const terminate: { handler?: () => void; disposed: boolean } = { disposed: false };
	const deps: OpenRequestsDeps = {
		isIgnored: vi.fn(() => "ignored" as const),
		makeDir: vi.fn(),
		createPrivateFile: vi.fn((path: string, text: string) => {
			texts.set(path, text);
			state.set(path, { kind: "file", firstLine: text.split("\n")[0] ?? "" });
		}),
		inspect: vi.fn((path: string) => state.get(path) ?? ({ kind: "none" } as PathState)),
		symlink: vi.fn((to: string, link: string) => void state.set(link, { kind: "symlink", to })),
		remove: vi.fn((path: string) => {
			state.delete(path);
			texts.delete(path);
			if (path === LOCK) lockHeld = false;
		}),
		takeLock: vi.fn((path: string) => {
			if (lockHeld) return false;
			lockHeld = true;
			state.set(path, { kind: "file", firstLine: "1" });
			return true;
		}),
		processes: vi.fn(async () => "/usr/bin/zsh\n/usr/bin/node\n"),
		run: vi.fn(async () => {
			during.text = texts.get(SECRETS);
			during.links = [SENTINEL, COMLINK].filter((l) => state.get(l)?.kind === "symlink");
			return 0;
		}),
		onTerminate: vi.fn((handler: () => void) => {
			terminate.handler = handler;
			return () => void (terminate.disposed = true);
		}),
		pid: 4242,
		platform: "darwin",
		...over,
	};
	return { deps, state, texts, during, terminate, hold: () => void (lockHeld = true) };
}

async function run(
	over: Partial<RunOpenRequestsInput> = {},
	options: {
		tools?: Tooling[];
		providers?: Array<[string, Record<string, unknown>]>;
		vault?: unknown;
		deps?: Partial<OpenRequestsDeps>;
		fake?: ReturnType<typeof fakeDeps>;
	} = {}
) {
	const lines: string[] = [];
	const tools = options.tools ?? [
		tool(
			"bruno",
			vi.fn(async () => PLAN)
		),
	];
	const files = options.fake ?? fakeDeps(options.deps);
	const caps: Record<string, unknown> = { tooling: tools };
	const v = "vault" in options ? options.vault : vault();
	if (v) caps.vault = v;
	const report = await runOpenRequests({
		loaded: loadedWith({ tooling: options.providers ?? tools.map((t) => [t.providerName, OPTIONS]) }),
		context: { repoRoot: ROOT },
		yes: true,
		loader: fakeLoader(caps),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		deps: files.deps,
		...over,
	});
	return { report, text: lines.join("\n"), files };
}

const readsValues = () =>
	readEntryValues.mockResolvedValue({
		environmentId: "acme/demo - dev",
		values: new Map([
			["SENTINEL_WEBHOOK_SECRET", VALUE],
			["COMLINK_SENTRY_SECRET", "other-secret"],
		]),
		missing: [],
	});

beforeEach(() => {
	readEntryValues.mockReset();
	inquirerConfirm.mockReset();
});

describe("runOpenRequests", () => {
	describe("choosing the provider", () => {
		it("fails when the config has no tooling provider", async () => {
			const { report, text } = await run({}, { providers: [] });
			expect(report.status).toBe("fail");
			expect(text).toContain("the config has no `tooling` provider to open");
		});

		it("fails for a --to that is not a tooling provider of the config", async () => {
			const { report, text } = await run({ to: "postman" });
			expect(report.status).toBe("fail");
			expect(text).toContain("not a `tooling` provider of this config (bruno)");
		});

		it("fails when no provider can open its workspace, and when more than one can", async () => {
			const none = await run({}, { tools: [tool("postman")] });
			expect(none.text).toContain("no `tooling` provider can open its workspace");
			const two = await run({}, { tools: [tool("a", vi.fn()), tool("b", vi.fn())] });
			expect(two.report.status).toBe("fail");
			expect(two.text).toContain("(a, b); name one with --to");
		});

		it("opens only the provider --to names", async () => {
			const open = vi.fn(async () => ({ ...PLAN, wants: [], targets: [] }));
			const { report } = await run({ to: "bruno" }, { tools: [tool("bruno", open), tool("other", vi.fn())] });
			expect(report.status).toBe("ok");
			expect(open).toHaveBeenCalledWith({ ...OPTIONS, repoRoot: ROOT });
		});

		it("reads a provider's file lists as none when they are not lists of names", async () => {
			const open = vi.fn(async () => ({ ...PLAN, wants: [], targets: [] }));
			await run({}, { tools: [tool("bruno", open)], providers: [["bruno", { collectionFiles: "x" }]] });
			expect(open).toHaveBeenCalledWith({ collectionFiles: [], envFiles: [], repoRoot: ROOT });
		});

		it("reports a provider that cannot read the workspace", async () => {
			const { report, text } = await run(
				{},
				{ tools: [tool("bruno", vi.fn().mockRejectedValue(new Error("no workspace")))] }
			);
			expect(report.status).toBe("fail");
			expect(text).toContain("no workspace");
		});
	});

	describe("--dry-run", () => {
		it("lists the names and the route, and reads, writes and starts nothing", async () => {
			const { report, text, files } = await run({ context: { repoRoot: ROOT, dryRun: true } });
			expect(report.status).toBe("ok");
			expect(text).toContain("(dry-run)");
			expect(text).toContain(
				"would fill collections/sentinel's webhookSecret from SENTINEL_WEBHOOK_SECRET of dev as DEV_SENTINEL_WEBHOOK_SECRET"
			);
			expect(text).toContain(
				"would write 2 value(s) to .holocron/.private/requests.env and link it from 2 collection(s)"
			);
			expect(text).toContain("would start /Applications/Bruno.app/Contents/MacOS/Bruno in the foreground");
			expect(readEntryValues).not.toHaveBeenCalled();
			expect(files.deps.run).not.toHaveBeenCalled();
			expect(files.deps.createPrivateFile).not.toHaveBeenCalled();
		});

		it("says when nothing refers to an entry, and names the secrets nobody fills", async () => {
			const open = vi.fn(async () => ({
				...PLAN,
				wants: [],
				targets: [],
				unfilled: ["collections/x: tokenSecret"],
			}));
			const { text } = await run({ context: { repoRoot: ROOT, dryRun: true } }, { tools: [tool("bruno", open)] });
			expect(text).toContain("nothing to fill: no variable refers to an entry");
			expect(text).toContain("1 secret variable(s) refer to no entry, so nobody fills them");
			expect(text).toContain("collections/x: tokenSecret");
		});
	});

	describe("refusals before anything is read", () => {
		it("refuses on Windows when there is something to write", async () => {
			const { report, text } = await run({}, { deps: { platform: "win32" } });
			expect(report.status).toBe("fail");
			expect(text).toContain("cannot make the values file private on Windows");
		});

		it("refuses when Bruno is already running, and never touches it", async () => {
			const { report, text, files } = await run(
				{},
				{ deps: { processes: async () => "node\n/Applications/Bruno.app/Contents/MacOS/Bruno --flag\n" } }
			);
			expect(report.status).toBe("fail");
			expect(text).toContain("Bruno is already running; quit it and run this again");
			expect(readEntryValues).not.toHaveBeenCalled();
			expect(files.deps.run).not.toHaveBeenCalled();
		});

		it("fails when the process list cannot be read", async () => {
			const { report, text } = await run(
				{},
				{ deps: { processes: async () => Promise.reject(new Error("ps missing")) } }
			);
			expect(report.status).toBe("fail");
			expect(text).toContain("could not tell whether Bruno is running: ps missing");
		});

		it("asks whether stdin is a terminal when nothing says, which it is not under test", async () => {
			const err = await run({ yes: false }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
		});

		it("fails when the config names no tooling provider at all", async () => {
			const lines: string[] = [];
			const report = await runOpenRequests({
				loaded: loadedWith({ issues: "github" }),
				context: { repoRoot: ROOT },
				yes: true,
				loader: fakeLoader({}),
				print: (l) => lines.push(l),
				deps: fakeDeps().deps,
			});
			expect(report.status).toBe("fail");
			expect(lines.join("\n")).toContain("the config has no `tooling` provider to open");
		});

		it("fails when no tooling plugin could be loaded", async () => {
			const lines: string[] = [];
			const report = await runOpenRequests({
				loaded: loadedWith({ tooling: [["bruno", OPTIONS]] }),
				context: { repoRoot: ROOT },
				yes: true,
				loader: fakeLoader({}),
				print: (l) => lines.push(l),
				deps: fakeDeps().deps,
			});
			expect(report.status).toBe("fail");
			expect(lines.join("\n")).toContain("no `tooling` provider can open its workspace");
		});

		it("refuses without a terminal and without --yes", async () => {
			const err = await run({ yes: false, interactive: false }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
			expect((err as Error).message).toMatch(/writes 2 secret value\(s\).*pass --yes/);
		});

		it("stops when the person says no, having read nothing", async () => {
			const confirm = vi.fn(async () => false);
			const { report, text } = await run({ yes: false, interactive: true, confirm });
			expect(report.status).toBe("cancelled");
			expect(text).toContain("cancelled; nothing was read or written");
			expect(confirm).toHaveBeenCalledWith("Read 2 value(s) from dev and start Bruno with them?");
			expect(readEntryValues).not.toHaveBeenCalled();
		});

		it("asks the default prompt when none is injected, and goes on when the answer is yes", async () => {
			readsValues();
			inquirerConfirm.mockResolvedValueOnce(true);
			const { report } = await run({ yes: false, interactive: true });
			expect(report.status).toBe("ok");
			expect(inquirerConfirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
		});

		it("words the question for a run with nothing to fill", async () => {
			const confirm = vi.fn(async () => false);
			const open = vi.fn(async () => ({ ...PLAN, wants: [], targets: [] }));
			await run({ yes: false, interactive: true, confirm }, { tools: [tool("bruno", open)] });
			expect(confirm).toHaveBeenCalledWith("Start Bruno (nothing to fill)?");
		});
	});

	describe("reading the Environment", () => {
		it("fails when there is no vault, and when the vault cannot read entries", async () => {
			const none = await run({}, { vault: undefined });
			expect(none.text).toContain("needs a `vault` provider in holocron.config.ts (1password)");
			const plain = await run({}, { vault: { providerName: "doppler" } });
			expect(plain.text).toContain("doppler cannot read an Environment's entries");
			expect(plain.report.status).toBe("fail");
		});

		it("fails with the reason when the read fails, and names a missing entry without starting", async () => {
			readEntryValues.mockRejectedValueOnce(new Error("op said no"));
			const failed = await run();
			expect(failed.text).toContain("vault dev");
			expect(failed.text).toContain("op said no");
			readEntryValues.mockResolvedValueOnce({
				environmentId: "acme/demo - dev",
				values: new Map(),
				missing: ["COMLINK_SENTRY_SECRET"],
			});
			const missing = await run();
			expect(missing.report.status).toBe("fail");
			expect(missing.text).toContain("acme/demo - dev holds no value for COMLINK_SENTRY_SECRET");
			expect(missing.files.deps.run).not.toHaveBeenCalled();
			expect(missing.files.deps.createPrivateFile).not.toHaveBeenCalled();
		});

		it("passes only the names the collection refers to, for the layer asked for", async () => {
			readsValues();
			await run();
			expect(readEntryValues).toHaveBeenCalledTimes(1);
			expect(readEntryValues).toHaveBeenCalledWith(
				expect.objectContaining({
					environment: "dev",
					repoRoot: ROOT,
					names: ["COMLINK_SENTRY_SECRET", "SENTINEL_WEBHOOK_SECRET"],
				})
			);
		});
	});

	describe("layers", () => {
		const both = () =>
			readEntryValues.mockImplementation(async ({ environment }: { environment: string }) => ({
				environmentId: `acme/demo - ${environment}`,
				values: new Map([
					["SENTINEL_WEBHOOK_SECRET", `${environment}-sentinel`],
					["COMLINK_SENTRY_SECRET", `${environment}-comlink`],
				]),
				missing: [],
			}));

		it("loads dev alone by default and says which layers are not loaded, naming the variable and the flag", async () => {
			readsValues();
			const { text } = await run();
			expect(text).toContain("loaded: dev; not loaded: local, prod");
			expect(text).toContain(
				"collections/sentinel: webhookSecret is a prod secret (PROD_SENTINEL_WEBHOOK_SECRET); start with --environment prod to load it"
			);
			expect(readEntryValues).toHaveBeenCalledTimes(1);
		});

		it("reads each named layer from its own Environment and writes each under its own prefixed name", async () => {
			both();
			const { report, text, files } = await run({ environments: ["prod,dev"] });
			expect(report.status).toBe("ok");
			expect(readEntryValues.mock.calls.map(([call]) => call.environment)).toEqual(["dev", "prod"]);
			expect(files.during.text).toBe(
				`${MARKER}\nDEV_SENTINEL_WEBHOOK_SECRET=dev-sentinel\nDEV_COMLINK_SENTRY_SECRET=dev-comlink\nPROD_SENTINEL_WEBHOOK_SECRET=prod-sentinel\n`
			);
			expect(text).toContain("loaded: dev, prod; not loaded: local");
			expect(text).not.toContain("prod-sentinel");
		});

		it("lists nothing as not loaded when every layer with a secret is named", async () => {
			both();
			const { text } = await run({ environments: ["local", "dev", "prod"] });
			expect(text).toContain("loaded: local, dev, prod; not loaded: none");
			expect(text).not.toContain("start with --environment");
		});

		it("does not read a layer that has nothing to fill", async () => {
			both();
			await run({ environments: ["local", "dev"] });
			expect(readEntryValues.mock.calls.map(([call]) => call.environment)).toEqual(["dev"]);
		});

		it("fails closed when any named layer cannot give an entry, reading the others and starting nothing", async () => {
			readEntryValues.mockImplementation(async ({ environment }: { environment: string }) =>
				environment === "prod"
					? { environmentId: "acme/demo - prod", values: new Map(), missing: ["SENTINEL_WEBHOOK_SECRET"] }
					: {
							environmentId: "acme/demo - dev",
							values: new Map([
								["SENTINEL_WEBHOOK_SECRET", "a"],
								["COMLINK_SENTRY_SECRET", "b"],
							]),
							missing: [],
						}
			);
			const { report, text, files } = await run({ environments: ["dev", "prod"] });
			expect(report.status).toBe("fail");
			expect(text).toContain("prod SENTINEL_WEBHOOK_SECRET");
			expect(text).toContain("acme/demo - prod holds no value for SENTINEL_WEBHOOK_SECRET");
			expect(files.deps.createPrivateFile).not.toHaveBeenCalled();
			expect(files.deps.run).not.toHaveBeenCalled();
		});

		it("fails closed when a layer's Environment cannot be read at all, naming the layer", async () => {
			readEntryValues.mockRejectedValue(new Error("no access"));
			const { report, text, files } = await run({ environments: ["dev", "prod"] });
			expect(report.status).toBe("fail");
			expect(text).toContain("vault dev");
			expect(text).toContain("vault prod");
			expect(files.deps.run).not.toHaveBeenCalled();
		});

		it("refuses a layer that is not local, dev or prod, before anything is read", async () => {
			await expect(run({ environments: ["ci"] })).rejects.toThrow(/does not know "ci": use local, dev, prod/);
			expect(readEntryValues).not.toHaveBeenCalled();
		});

		it("lists the names per layer on a dry run, for the layers named only", async () => {
			const { text } = await run({ context: { repoRoot: ROOT, dryRun: true }, environments: ["prod"] });
			expect(text).toContain(
				"would fill collections/sentinel's webhookSecret from SENTINEL_WEBHOOK_SECRET of prod as PROD_SENTINEL_WEBHOOK_SECRET"
			);
			expect(text).not.toContain("of dev as");
			expect(text).toContain("loaded: prod; not loaded: local, dev");
			expect(readEntryValues).not.toHaveBeenCalled();
		});
	});

	describe("a session", () => {
		it("writes the values with a marker, links them, runs the tool, and removes everything after", async () => {
			readsValues();
			const { report, text, files } = await run();
			expect(report.status).toBe("ok");
			expect(files.during.text).toBe(
				`${MARKER}\nDEV_SENTINEL_WEBHOOK_SECRET=${VALUE}\nDEV_COMLINK_SENTRY_SECRET=other-secret\n`
			);
			expect(files.during.links).toEqual([SENTINEL, COMLINK]);
			expect(files.deps.symlink).toHaveBeenCalledWith("../../../.holocron/.private/requests.env", SENTINEL);
			expect(files.deps.run).toHaveBeenCalledWith(PLAN.launch);
			expect(files.state.size).toBe(0);
			expect(files.terminate.disposed).toBe(true);
			expect(text).toContain("ended with 0");
			expect(text).toContain("removed .holocron/.private/requests.env and its links");
		});

		it("never prints a value", async () => {
			readsValues();
			const { text } = await run();
			expect(text).not.toContain(VALUE);
			expect(text).not.toContain("other-secret");
			expect(text).toContain("2 value(s) read: DEV_SENTINEL_WEBHOOK_SECRET, DEV_COMLINK_SENTRY_SECRET");
		});

		it("fails the run when the tool ends with an error, and still cleans up", async () => {
			readsValues();
			const { report, text, files } = await run({}, { deps: { run: vi.fn(async () => 3) } });
			expect(report.status).toBe("fail");
			expect(text).toContain("ended with 3");
			expect(files.state.size).toBe(0);
		});

		it("cleans up when the tool cannot be started", async () => {
			readsValues();
			const { report, text, files } = await run(
				{},
				{ deps: { run: vi.fn().mockRejectedValue(new Error("ENOENT")) } }
			);
			expect(report.status).toBe("fail");
			expect(text).toContain("ENOENT");
			expect(files.state.size).toBe(0);
		});

		it("removes the values as soon as a signal arrives while the tool runs, and only once", async () => {
			readsValues();
			const fake = fakeDeps();
			const seen: { afterSignal?: number; removes?: number } = {};
			fake.deps.run = vi.fn(async () => {
				fake.terminate.handler?.();
				seen.afterSignal = fake.state.size;
				seen.removes = vi.mocked(fake.deps.remove).mock.calls.length;
				return 0;
			});
			await run({}, { fake });
			expect(seen.afterSignal).toBe(0);
			// The `finally` after the signal's own cleanup removes nothing more.
			expect(vi.mocked(fake.deps.remove).mock.calls.length).toBe(seen.removes);
		});

		it("starts the tool with no file and no link when nothing refers to an entry", async () => {
			const open = vi.fn(async () => ({ ...PLAN, wants: [], targets: [] }));
			const { report, files, text } = await run({}, { tools: [tool("bruno", open)] });
			expect(report.status).toBe("ok");
			expect(readEntryValues).not.toHaveBeenCalled();
			expect(files.deps.createPrivateFile).not.toHaveBeenCalled();
			expect(files.deps.run).toHaveBeenCalledTimes(1);
			expect(text).toContain("starting Bruno");
			expect(text).not.toContain("removed");
		});
	});

	describe("the lock", () => {
		it("refuses while another launch holds it, and leaves its lock alone", async () => {
			readsValues();
			const held = fakeDeps();
			held.hold();
			const { report, text } = await run({}, { fake: held });
			expect(report.status).toBe("fail");
			expect(text).toContain("another `open requests` is starting Bruno");
			expect(held.deps.run).not.toHaveBeenCalled();
			expect(held.deps.remove).not.toHaveBeenCalled();
		});

		it("is released when the run ends", async () => {
			readsValues();
			const { files } = await run();
			expect(files.deps.takeLock).toHaveBeenCalledWith(LOCK, 4242);
			expect(files.deps.remove).toHaveBeenCalledWith(LOCK);
		});
	});

	describe("the values file", () => {
		it("is refused when git tracks it, or cannot say", async () => {
			readsValues();
			const tracked = await run({}, { deps: { isIgnored: () => "tracked" } });
			expect(tracked.report.status).toBe("fail");
			expect(tracked.text).toContain("git does not ignore it, so it could be committed");
			expect(tracked.text).toContain("holocron sync");
			expect(tracked.files.deps.createPrivateFile).not.toHaveBeenCalled();
			const unknown = await run({}, { deps: { isIgnored: () => "unknown" } });
			expect(unknown.text).toContain("git could not say whether it ignores it");
			expect(unknown.files.deps.remove).toHaveBeenCalledWith(LOCK);
		});

		it("is accepted outside a git repository", async () => {
			readsValues();
			const { report } = await run({}, { deps: { isIgnored: () => "no-repo" } });
			expect(report.status).toBe("ok");
		});

		it("refuses a file that is not this command's, and writes nothing", async () => {
			readsValues();
			const taken = fakeDeps();
			taken.state.set(SECRETS, { kind: "file", firstLine: "SOMEONE=else" });
			const { report, text } = await run({}, { fake: taken });
			expect(report.status).toBe("fail");
			expect(text).toContain("is not this command's (no marker line); move it away");
			expect(taken.deps.createPrivateFile).not.toHaveBeenCalled();
		});

		it("refuses a directory in its place", async () => {
			readsValues();
			const { text } = await run(
				{},
				{ deps: { inspect: (p) => (p === SECRETS ? { kind: "other" } : { kind: "none" }) } }
			);
			expect(text).toContain("is not this command's");
		});

		it("replaces a leftover of its own, marker line and all", async () => {
			readsValues();
			const left = fakeDeps();
			left.state.set(SECRETS, { kind: "file", firstLine: MARKER });
			left.state.set(SENTINEL, { kind: "symlink", to: "../../../.holocron/.private/requests.env" });
			const { report } = await run({}, { fake: left });
			expect(report.status).toBe("ok");
			expect(left.deps.remove).toHaveBeenCalledWith(SECRETS);
			expect(left.deps.remove).toHaveBeenCalledWith(SENTINEL);
			expect(left.deps.createPrivateFile).toHaveBeenCalledTimes(1);
		});

		it("writes a value dotenv can read back, and refuses one it cannot", async () => {
			readEntryValues.mockResolvedValueOnce({
				environmentId: "acme/demo - dev",
				values: new Map([
					["SENTINEL_WEBHOOK_SECRET", "has space"],
					["COMLINK_SENTRY_SECRET", `all'three"kinds\`of quote`],
				]),
				missing: [],
			});
			const { report, text, files } = await run();
			expect(report.status).toBe("fail");
			expect(text).toContain("the value of DEV_COMLINK_SENTRY_SECRET cannot be written to a .env file as it is");
			expect(text).not.toContain("kinds");
			expect(files.deps.createPrivateFile).not.toHaveBeenCalled();
		});
	});

	describe("the links", () => {
		it("refuses a regular .env of somebody else's, and writes nothing", async () => {
			readsValues();
			const taken = fakeDeps();
			taken.state.set(COMLINK, { kind: "file", firstLine: "MINE=1" });
			const { report, text } = await run({}, { fake: taken });
			expect(report.status).toBe("fail");
			expect(text).toContain(".bruno/collections/comlink/.env exists and is not this command's");
			expect(taken.deps.createPrivateFile).not.toHaveBeenCalled();
			expect(taken.deps.symlink).not.toHaveBeenCalled();
		});

		it("refuses a link that points somewhere else", async () => {
			readsValues();
			const taken = fakeDeps();
			taken.state.set(SENTINEL, { kind: "symlink", to: "/elsewhere/.env" });
			const { report } = await run({}, { fake: taken });
			expect(report.status).toBe("fail");
		});

		it("removes a marked .env file left by a crashed run", async () => {
			readsValues();
			const left = fakeDeps();
			left.state.set(SENTINEL, { kind: "file", firstLine: MARKER });
			const { report } = await run({}, { fake: left });
			expect(report.status).toBe("ok");
			expect(left.deps.remove).toHaveBeenCalledWith(SENTINEL);
		});

		it("leaves a link that is no longer its own when it cleans up", async () => {
			readsValues();
			const fake = fakeDeps();
			fake.deps.run = vi.fn(async () => {
				fake.state.set(SENTINEL, { kind: "symlink", to: "/someone/else" });
				return 0;
			});
			await run({}, { fake });
			expect(fake.state.get(SENTINEL)).toEqual({ kind: "symlink", to: "/someone/else" });
		});
	});
});
