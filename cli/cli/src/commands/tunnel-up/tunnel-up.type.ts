import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

/** Input for {@link runTunnelUp}. */
export interface RunTunnelUpInput {
	/** The loaded config: its `tunnels` and `dns` providers are the ones used. */
	loaded: LoadedConfig;
	/** The runtime context (dry run, tokens, org). */
	context: RuntimeContext;
	/** The tunnel's name. A second run finds the first one's tunnel by it. */
	name: string;
	/** The public hostname the tunnel serves. */
	hostname: string;
	/** The local port requests are sent to. */
	port: number;
	/** Print how to start the tunnel when it was not run. Defaults to `true`; a caller that runs it itself says `false`. */
	hint?: boolean | undefined;
	/** Run the tunnel in the foreground once it is set up. */
	run?: boolean | undefined;
	/** The plugin loader. Defaults to one for `loaded`. */
	loader?: PluginLoader | undefined;
	/** Where the rows go (never the tunnel's token). Defaults to stdout. */
	print?: ((line: string) => void) | undefined;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger | undefined;
	/** Runs the connector with the token and resolves with its exit status. Defaults to `cloudflared`. */
	runConnector?: ((token: string) => Promise<number>) | undefined;
}

/** What `holocron tunnel up` did. */
export interface TunnelUpReport {
	/** `fail` when a step failed or the connector exited non-zero, otherwise `ok`. */
	status: "ok" | "fail";
	/** The tunnel's id, once there is one. */
	tunnelId?: string;
	/** The public address the tunnel answers on. */
	url?: string;
	/** The connector's exit status, when it was run. */
	exitCode?: number;
	/** Rows that succeeded and rows that failed, for the summary line. */
	summary: { ok: number; fail: number };
}
