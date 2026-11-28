import { join } from "node:path";

import { diskIo } from "../disk-io/index.js";
import { DNS_RECORDS_FILE, type DnsListEntry, type DnsRecordsIo } from "../dns-records.type.js";
import { parseDnsRecords } from "../parse-dns-records/index.js";

/** The records `.holocron/dns-records.json` lists; none when the file is absent. */
export async function readDnsRecords(repoRoot: string, io: DnsRecordsIo = diskIo): Promise<DnsListEntry[]> {
	const text = await io.read(join(repoRoot, DNS_RECORDS_FILE));
	return text === null ? [] : parseDnsRecords(text, DNS_RECORDS_FILE);
}
