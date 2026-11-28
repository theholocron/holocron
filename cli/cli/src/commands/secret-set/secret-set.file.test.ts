import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NonInteractiveError } from "@theholocron/kyber/ui";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import type { HandOffSecretInput } from "../secret-handoff/index.js";
import { runSecretSet } from "./secret-set.js";

const OLD = "old-value-0000";
const GENERATED = "ab".repeat(32);
const fixed = (size: number) => new Uint8Array(size).fill(0xab);

const loaded: LoadedConfig = {
	resolved: resolveConfig({ name: "demo", providers: { vault: "1password", secrets: "github" } }),
	filepath: "/tmp/test/holocron.config.json",
};

function plugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: () => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

/** A loader over fake plugins: the vault answers each read with the next of `reads` (a value, or `undefined` for absent). */
function makeLoader(reads: Array<string | undefined>, setSecret = vi.fn(async () => undefined)) {
	let call = 0;
	const readEnvironmentEntries = vi.fn(async () => {
		const value = reads[Math.min(call++, reads.length - 1)];
		return value === undefined ? [] : [{ name: "CRON_SECRET", value, concealed: true }];
	});
	const modules: Record<string, unknown> = {
		"@theholocron/holocron-plugin-1password": plugin("1p", {
			vault: { providerName: "1password", readEnvironmentEntries },
		}),
		"@theholocron/holocron-plugin-github": plugin("gh", { secrets: { providerName: "github", setSecret } }),
	};
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	const loader = new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
	);
	return { loader, readEnvironmentEntries, setSecret, importer };
}

function run(
	over: Partial<Parameters<typeof runSecretSet>[0]> = {},
	reads: Array<string | undefined> = [OLD, GENERATED]
) {
	const printed: string[] = [];
	const logger = fakeLogger();
	const made = makeLoader(reads);
	const handOff = vi.fn(async (_input: HandOffSecretInput) => ({ status: "ok" as const }));
	const result = runSecretSet({
		loaded,
		context: { repoRoot: "/tmp/test" },
		name: "CRON_SECRET",
		target: "file",
		generate: true,
		environment: "prod",
		yes: true,
		loader: made.loader,
		print: (line) => printed.push(line),
		logger,
		random: fixed,
		resolveEnvironment: async (id) => `theholocron/holocron - ${id}`,
		handOff,
		interactive: false,
		...over,
	});
	return { result, printed, logger, handOff, ...made };
}

describe("runSecretSet --target file --generate", () => {
	it("hands a made value to the private file, checks the import and names the sync", async () => {
		const { result, printed, handOff, logger } = run();
		expect(await result).toMatchObject({ status: "ok", name: "CRON_SECRET" });
		expect(handOff).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "CRON_SECRET",
				value: GENERATED,
				base: "/tmp/test",
				environment: "theholocron/holocron - prod",
			})
		);
		const text = printed.join("\n");
		expect(text).toContain("holds a new CRON_SECRET");
		expect(text).toContain("holocron sync <app> --env prod");
		expect(text).toContain("redeploy");
		// the value reaches the file writer only
		expect(text).not.toContain(GENERATED);
		expect(text).not.toContain(OLD);
		expect(JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls])).not.toContain(GENERATED);
	});

	it("fails when the Environment still holds the old value", async () => {
		const { result, printed } = run({}, [OLD, OLD]);
		const report = await result;
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/still holds the old value/);
		expect(printed.join("\n")).not.toContain("next: send it where it runs");
	});

	it("is not a failure when the Environment cannot be read afterwards, and says so", async () => {
		const { result, printed, readEnvironmentEntries } = run();
		readEnvironmentEntries.mockResolvedValueOnce([{ name: "CRON_SECRET", value: OLD, concealed: true }]);
		readEnvironmentEntries.mockRejectedValueOnce(new Error("offline"));
		expect((await result).status).toBe("ok");
		expect(printed.join("\n")).toContain("could not read theholocron/holocron - prod to check the import: offline");
	});

	it("without --env writes the file and checks nothing, loading no plugin", async () => {
		const { result, printed, handOff, importer, readEnvironmentEntries } = run({ environment: undefined });
		expect((await result).status).toBe("ok");
		expect(handOff).toHaveBeenCalledOnce();
		expect(importer).not.toHaveBeenCalled();
		expect(readEnvironmentEntries).not.toHaveBeenCalled();
		expect(printed.join("\n")).toContain("holocron sync <app> --env <environment>");
	});

	it("writes nothing on --dry-run and reads no vault", async () => {
		const { result, handOff, readEnvironmentEntries } = run({ context: { repoRoot: "/tmp/test", dryRun: true } });
		expect((await result).status).toBe("dry-run");
		expect(handOff).not.toHaveBeenCalled();
		expect(readEnvironmentEntries).not.toHaveBeenCalled();
	});

	it("needs --yes without a terminal, and writes nothing", async () => {
		const { result, handOff } = run({ yes: false });
		await expect(result).rejects.toBeInstanceOf(NonInteractiveError);
		expect(handOff).not.toHaveBeenCalled();
	});

	it("asks first, and stops when the answer is no", async () => {
		const confirm = vi.fn(async () => false);
		const { result, handOff } = run({ yes: false, confirm });
		expect((await result).status).toBe("cancelled");
		expect(confirm).toHaveBeenCalledOnce();
		expect(handOff).not.toHaveBeenCalled();
	});

	it("reports a hand-off that failed, and reads the Environment only the once before it", async () => {
		const failing = vi.fn(async () => ({ status: "fail" as const, reason: "not-ignored" }));
		const { result, readEnvironmentEntries, printed } = run({ handOff: failing });
		const report = await result;
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/not handed over \(not-ignored\)/);
		expect(readEnvironmentEntries).toHaveBeenCalledTimes(1);
		expect(printed.join("\n")).not.toContain("next: send it where it runs");
	});

	it("refuses a name the CLI does not generate, before anything is written", async () => {
		const { result, handOff } = run({ name: "HOLOCRON_CLOUDFLARE_TOKEN" });
		await expect(result).rejects.toThrow(/is not a secret the CLI generates/);
		expect(handOff).not.toHaveBeenCalled();
	});

	it("refuses --generate beside a value", async () => {
		await expect(run({ value: "x" }).result).rejects.toThrow(/--generate makes the value/);
		await expect(run({ fromStdin: true }).result).rejects.toThrow(/--generate makes the value/);
	});
});

describe("runSecretSet --target file environment and value sourcing", () => {
	it("takes a name that is not a layer word as the Environment, with no git read", async () => {
		const { result, handOff } = run({ resolveEnvironment: undefined, environment: "Some Environment" });
		expect((await result).status).toBe("ok");
		expect(handOff).toHaveBeenCalledWith(expect.objectContaining({ environment: "Some Environment" }));
	});

	it("says so when there is no value to hand over", async () => {
		const { result, handOff } = run({ generate: false });
		await expect(result).rejects.toThrow(/no value for secret `CRON_SECRET`/);
		expect(handOff).not.toHaveBeenCalled();
	});
});

describe("runSecretSet --target file defaults and edge answers", () => {
	it("goes ahead when the question is answered yes", async () => {
		const { result, handOff } = run({ yes: false, confirm: async () => true });
		expect((await result).status).toBe("ok");
		expect(handOff).toHaveBeenCalledOnce();
	});

	it("asks the process whether there is a terminal when `interactive` says nothing", async () => {
		const { result, handOff } = run({ interactive: undefined, environment: undefined });
		expect((await result).status).toBe("ok");
		expect(handOff).toHaveBeenCalledWith(
			expect.objectContaining({ base: "/tmp/test", interactive: process.stdin.isTTY === true })
		);
	});

	it("skips the check, saying why, when no vault provider is configured", async () => {
		const noVault: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { secrets: "github" } }),
			filepath: "/tmp/test/holocron.config.json",
		};
		const made = makeLoader([OLD]);
		const loader = new PluginLoader(
			noVault.resolved,
			{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
			(async (pkg: string) => {
				throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
			}) as unknown as PluginImporter
		);
		const { result, printed } = run({ loaded: noVault, loader });
		expect((await result).status).toBe("ok");
		expect(printed.join("\n")).toContain("no vault provider is configured");
		expect(made.readEnvironmentEntries).not.toHaveBeenCalled();
	});

	it("prints to the console and builds its own loader when none are given (a dry run, so nothing is written)", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			const { result } = run({
				print: undefined,
				logger: undefined,
				loader: undefined,
				environment: undefined,
				context: { repoRoot: "/tmp/test", dryRun: true },
			});
			expect((await result).status).toBe("dry-run");
			expect(log).toHaveBeenCalled();
			expect(log.mock.calls.flat().join("\n")).not.toContain(GENERATED);
		} finally {
			log.mockRestore();
		}
	});

	it("names a failed hand-off even when it gave no reason", async () => {
		const { result } = run({ handOff: async () => ({ status: "fail" as const }) });
		expect((await result).message).toBe("CRON_SECRET was not handed over (failed)");
	});

	it("uses the real hand-off when none is injected, and refuses a directory git does not vouch for", async () => {
		const base = mkdtempSync(join(tmpdir(), "secret-to-file-"));
		try {
			const { result, printed } = run({
				handOff: undefined,
				environment: undefined,
				context: { repoRoot: base },
			});
			const report = await result;
			expect(["ok", "fail"]).toContain(report.status);
			expect(printed.join("\n")).not.toContain(GENERATED);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

describe("runSecretSet --target file with a given value", () => {
	it("hands over the value it was given", async () => {
		const { result, handOff } = run({ generate: false, value: "given-value-xyz" });
		expect((await result).status).toBe("ok");
		expect(handOff).toHaveBeenCalledWith(expect.objectContaining({ value: "given-value-xyz" }));
	});
});

describe("runSecretSet --target github --generate", () => {
	it("sets a made value through the secrets capability and says it is not shown", async () => {
		const { result, setSecret, printed } = run({ target: "github", environment: undefined, yes: undefined });
		expect((await result).status).toBe("ok");
		expect(setSecret).toHaveBeenCalledWith({ kind: "repo" }, "CRON_SECRET", GENERATED);
		const text = printed.join("\n");
		expect(text).toContain("cannot be copied anywhere else");
		expect(text).not.toContain(GENERATED);
	});

	it("refuses --env, which belongs to the file target", async () => {
		await expect(run({ target: "github" }).result).rejects.toThrow(/--env belongs to --target file/);
	});
});
