import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { DnsListEntry, DnsRecordsIo } from "../../dns-records/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

/** The fields of a record a person is asked for when a flag leaves one out. */
export type NewDomainField = "type" | "name" | "value";

export interface RunNewDomainInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Each is asked for through `ask` when absent; with no `ask` (no terminal) a missing one is an error. */
	type?: string;
	name?: string;
	value?: string;
	note?: string;
	proxied?: boolean;
	/** Make the record without asking first. */
	yes?: boolean;
	loader: PluginLoader;
	print: (line: string) => void;
	logger: Logger;
	/** Ask for one missing field. Absent when there is no terminal. */
	ask?: (field: NewDomainField) => Promise<string>;
	/** Ask whether to go on. Absent when there is no terminal. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the list lives; the disk by default. */
	io?: DnsRecordsIo;
}

export interface NewDomainReport {
	/** `cancelled` when the person said no; nothing was written. */
	status: "ok" | "fail" | "dry-run" | "cancelled";
	entry?: DnsListEntry;
	message?: string;
}
