/**
 * `holocron tunnel up` — a named tunnel with a stable public hostname that reaches a port on this machine, for a
 * webhook that has to find a development instance (a GitHub App's webhook URL cannot change on every run).
 *
 * The `tunnels` provider finds or makes the tunnel and its route; the `dns` provider points a proxied `CNAME` for the
 * hostname at it. Both are idempotent, so a second run changes nothing. With `run`, the connector is started in the
 * foreground with the token in its environment. The token is never printed.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Dns,
	type EnsuredTunnel,
	PluginLoader,
	type Tunnels,
} from "../../plugin/index.js";
import { style, withSpinner } from "../../ui/index.js";
import { describeProviderError } from "../../ui/provider-error/index.js";
import { runCloudflared } from "../run-cloudflared/index.js";
import type { RunTunnelUpInput, TunnelUpReport } from "./tunnel-up.type.js";

const COMMAND = "tunnel up";

/** Why a provider is missing: its own load error when it failed to load, else how to configure it. */
function missing(loader: PluginLoader, key: "tunnels" | "dns", hint: string): string {
	const failure = loader.loadFailures().find((f) => f.key === key);
	return failure ? `${hint} (\`${failure.provider}\` failed to load: ${describeProviderError(failure.error)})` : hint;
}

export async function runTunnelUp(input: RunTunnelUpInput): Promise<TunnelUpReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const summary = { ok: 0, fail: 0 };
	const row = (ok: boolean, label: string, detail: string) => {
		summary[ok ? "ok" : "fail"] += 1;
		const text = `${label}  ${style.dim(`(${detail})`)}`;
		print(`  ${ok ? style.success(text) : style.fail(text)}`);
	};
	const finish = (status: "ok" | "fail", extra: Omit<TunnelUpReport, "status" | "summary"> = {}): TunnelUpReport => {
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
	print(style.header(`Holocron tunnel up — ${input.hostname}${dryRun ? " (dry-run)" : ""}`));
	print("");
	if (!loader.has("tunnels")) {
		row(
			false,
			"tunnels",
			missing(loader, "tunnels", "needs a `tunnels` provider in holocron.config.ts (cloudflare)")
		);
		return finish("fail");
	}
	if (!loader.has("dns")) {
		row(false, "dns", missing(loader, "dns", "needs a `dns` provider in holocron.config.ts (cloudflare)"));
		return finish("fail");
	}
	const tunnels = loader.get("tunnels") as Tunnels;
	const dns = loader.get("dns") as Dns;
	const service = `http://localhost:${input.port}`;
	const url = `https://${input.hostname}`;

	if (dryRun) {
		row(true, `tunnel ${input.name}`, `would serve ${input.hostname} at ${service}`);
		row(true, `dns ${input.hostname}`, "would point a proxied CNAME at the tunnel");
		return finish("ok", { url });
	}

	let ensured: EnsuredTunnel;
	try {
		ensured = await tunnels.ensureTunnel({ name: input.name, hostname: input.hostname, service });
	} catch (err) {
		row(false, `tunnel ${input.name}`, errorMessage(err));
		return finish("fail");
	}
	const did = [ensured.created ? "created" : "found", ensured.configured ? "route set" : "route in step"];
	row(true, `tunnel ${ensured.name}`, `${did.join(", ")}: ${input.hostname} to ${service}`);

	try {
		await dns.upsertRecord(input.hostname, {
			type: "CNAME",
			name: input.hostname,
			content: ensured.target,
			proxied: true,
		});
	} catch (err) {
		row(false, `dns ${input.hostname}`, errorMessage(err));
		return finish("fail", { tunnelId: ensured.id });
	}
	row(true, `dns ${input.hostname}`, "proxied CNAME to the tunnel");
	print("");
	print(`address: ${url}`);

	if (!input.run) {
		if (input.hint !== false) {
			print(
				`start it with: holocron tunnel up --name ${input.name} --hostname ${input.hostname} --port ${input.port} --run`
			);
		}
		return finish("ok", { tunnelId: ensured.id, url });
	}

	// The token goes straight to the connector's environment; nothing here prints it.
	let exitCode: number;
	try {
		const token = await tunnels.tunnelToken(ensured.id);
		print(`running cloudflared (Ctrl-C stops it): ${url} to ${service}`);
		exitCode = await (input.runConnector ?? runCloudflared)(token);
	} catch (err) {
		row(false, "cloudflared", errorMessage(err));
		return finish("fail", { tunnelId: ensured.id, url });
	}
	row(exitCode === 0, "cloudflared", `exited ${exitCode}`);
	return finish(exitCode === 0 ? "ok" : "fail", { tunnelId: ensured.id, url, exitCode });
}
