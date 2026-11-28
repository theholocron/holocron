/** The result of asking a provider who a token belongs to. */
export type ConnectionVerifyResult = { ok: true; subject: string } | { ok: false; message: string };

/** One line a connection probe reports. */
export interface ConnectionProbeRow {
	/** `ok` or `fail` for a result, `info` for a fact. */
	status: "ok" | "fail" | "info";
	/** The row's short title. */
	label: string;
	/** Further detail, when there is some. */
	detail?: string;
}

/** What a connection probe is handed: where to report, and which values must never be printed. Satisfied by a probe context. */
export interface ConnectionProbeContext {
	/** Reports one line. */
	say(row: ConnectionProbeRow): void;
	/** Marks a value (the token) as one that must never be printed. */
	secret(value: string | undefined): void;
}

/** A probe that checks the network path to a provider and its token. Assignable to a plugin system's probe type. */
export interface ConnectionProbe {
	/** One sentence for a listing of probes. */
	summary: string;
	/** Always `false`: it creates and changes nothing. */
	writes: false;
	/** Runs the probe, reporting through `ctx`. */
	run(ctx: ConnectionProbeContext): Promise<void>;
}

/** What a connection probe needs to check a provider's host and token. */
export interface ConnectionProbeInput {
	/** How the provider is named in output, e.g. `Axiom`. */
	provider: string;
	/** A URL on the provider's API host. Without one, only the token is checked (a provider that has no HTTP API of its own). */
	url?: string;
	/** Finds the token the plugin would use. Throws with a message that says where to put one when there is none. */
	token: () => string | Promise<string>;
	/** Asks the provider who the token belongs to. */
	verify: (token: string) => Promise<ConnectionVerifyResult>;
	/** Stands in for the network, so with one the name lookup (which cannot be stood in for) is not made. */
	fetch?: typeof fetch;
	/** Resolves a hostname. Defaults to the system resolver, unless `fetch` is given. */
	lookup?: (host: string) => Promise<{ address: string }>;
	/** Longest to wait for the host to answer. Defaults to 10 s. */
	timeoutMs?: number;
}
