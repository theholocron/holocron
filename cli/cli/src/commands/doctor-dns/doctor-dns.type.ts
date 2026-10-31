import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { DnsRecord, PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorDnsInput {
	/** The loaded config: its tasks, domain and notification layouts say which records `setup` writes. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	loader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorDnsReport {
	/** `fail` if any zone failed, `skip` if every row was skipped, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why every row was skipped, when they were. */
	reason?: string;
}

/** A record the config makes `setup` write, and the zone it belongs in. */
export interface ExpectedDnsRecord {
	/** The zone passed to the `dns` provider: it finds the zone that holds the name. */
	zone: string;
	record: Pick<DnsRecord, "type" | "name" | "content" | "proxied">;
}
