import { join } from "node:path";

import { formatJson } from "@theholocron/astromech";

import { diskIo } from "../disk-io/index.js";
import { DNS_RECORDS_FILE, type DnsListEntry, type DnsRecordsIo } from "../dns-records.type.js";

/** Write the list the way Prettier lays JSON out, so a rewrite leaves the file formatted. */
export async function writeDnsRecords(
	repoRoot: string,
	list: readonly DnsListEntry[],
	io: DnsRecordsIo = diskIo
): Promise<void> {
	await io.write(join(repoRoot, DNS_RECORDS_FILE), formatJson(list));
}
