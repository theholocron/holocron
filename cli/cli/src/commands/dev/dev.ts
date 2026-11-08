/**
 * `holocron dev` — run an application locally behind its development tunnel, in one command.
 *
 * The vault environment's variables are read in memory and handed to the application's process, never written to
 * disk or printed (only how many there are). The tunnel and its DNS record are set up the way `holocron tunnel up`
 * does, and the tunnel's connector runs beside the application; Ctrl-C stops both.
 */

import { superviseProcesses } from "@theholocron/dagobah";
import { type Environment, PREFIX } from "@theholocron/env-utils/lookup";
import { describeError, style, withSpinner } from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Tunnels, type Vault } from "../../plugin/index.js";
import { runTunnelUp } from "../tunnel-up/index.js";
import type { DevReport, RunDevInput } from "./dev.type.js";

const COMMAND = "dev";

/** The environment the application is told it runs in, which its logger tags every line with. */
const APP_ENVIRONMENT: Environment = "development";

export async function runDev(input: RunDevInput): Promise<DevReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const summary = { ok: 0, fail: 0 };
	const row = (ok: boolean, label: string, detail: string) => {
		summary[ok ? "ok" : "fail"] += 1;
		const text = `${label}  ${style.dim(`(${detail})`)}`;
		print(`  ${ok ? style.success(text) : style.fail(text)}`);
	};
	const finish = (status: "ok" | "fail", extra: { exitCode?: number } = {}): DevReport => {
		print("");
		const line = `${summary.ok} ok, ${summary.fail} failed`;
		print(summary.fail > 0 ? style.fail(line) : style.success(line));
		logger[status === "ok" ? "info" : "warn"]({ status, ...summary }, COMMAND);
		return { status, summary, ...extra };
	};

	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());
	assertPluginsResolvable(loader, COMMAND);

	const dryRun = input.context.dryRun ?? false;
	// ENVIRONMENT is what the application's logger tags its lines with (`env`), so a dev instance is told apart from
	// production in one Axiom dataset. The vault can say otherwise; the port is the tunnel's, so it cannot.
	const [program, ...args] = input.command;
	const shown = input.command.join(" ");
	print(style.header(`Holocron dev — ${input.hostname}${dryRun ? " (dry-run)" : ""}`));
	print("");

	const vault = loader.has("vault") ? (loader.get("vault") as Vault) : undefined;
	if (!vault?.readEnvironment) {
		row(
			false,
			"vault",
			vault
				? `${vault.providerName} cannot read an environment's variables`
				: "needs a `vault` provider in holocron.config.ts (1password)"
		);
		return finish("fail");
	}

	// The tunnel first: it checks the `tunnels` and `dns` providers and says what is missing, before any value is read.
	const ensure = input.ensureTunnel ?? runTunnelUp;
	const tunnel = await ensure({
		loaded: input.loaded,
		context: input.context,
		name: input.name,
		hostname: input.hostname,
		port: input.port,
		run: false,
		hint: false,
		loader,
		print,
		logger,
	});
	summary.ok += tunnel.summary.ok;
	summary.fail += tunnel.summary.fail;
	if (tunnel.status === "fail") return finish("fail");

	if (dryRun) {
		row(true, `vault ${input.environment}`, "would read its variables for the application");
		row(true, shown, `would run beside cloudflared, with PORT=${input.port}`);
		return finish("ok");
	}

	let values: Record<string, string>;
	try {
		values = await vault.readEnvironment(input.environment);
	} catch (err) {
		row(false, `vault ${input.environment}`, describeError(err));
		return finish("fail");
	}
	row(true, `vault ${input.environment}`, `${Object.keys(values).length} variables, passed to the application`);

	let token: string;
	try {
		token = await (loader.get("tunnels") as Tunnels).tunnelToken(tunnel.tunnelId as string);
	} catch (err) {
		row(false, "cloudflared", describeError(err));
		return finish("fail");
	}

	print("");
	print(`running ${shown} and cloudflared (Ctrl-C stops both): ${tunnel.url} to localhost:${input.port}`);
	let exitCode: number;
	try {
		({ exitCode } = await (input.runProcesses ?? superviseProcesses)({
			primary: {
				command: program as string,
				args,
				env: {
					ENVIRONMENT: APP_ENVIRONMENT,
					...values,
					PORT: String(input.port),
					[`${PREFIX}_PORT`]: String(input.port),
				},
			},
			companion: {
				command: "cloudflared",
				args: ["tunnel", "--no-autoupdate", "run"],
				env: { TUNNEL_TOKEN: token },
			},
		}));
	} catch (err) {
		row(false, "dev", describeError(err));
		return finish("fail");
	}
	row(exitCode === 0, "dev", `ended with ${exitCode}`);
	return finish(exitCode === 0 ? "ok" : "fail", { exitCode });
}
