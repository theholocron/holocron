import type { DnsRecordType } from "../plugin/index.js";

/** The list's file, relative to the repository root. */
export const DNS_RECORDS_FILE = ".holocron/dns-records.json";

/** The record types `holocron new domain` takes. MX and SRV need a priority the entry does not carry. */
export const DNS_ENTRY_TYPES = ["CNAME", "TXT", "A", "AAAA"] as const satisfies readonly DnsRecordType[];

/** One record of `.holocron/dns-records.json`: public DNS data, never a secret. */
export interface DnsListEntry {
	type: (typeof DNS_ENTRY_TYPES)[number];
	/** The full hostname, e.g. `status.example.dev`. */
	name: string;
	/** The record's content, exactly as the vendor shows it. */
	value: string;
	/** Why it exists, e.g. which vendor serves the name. */
	note?: string;
	/** Default false: a vendor reads the record itself to verify the name, and a proxy would answer in its place. */
	proxied?: boolean;
}

/** The file system the list is read from and written to, so tests need no disk. */
export interface DnsRecordsIo {
	/** The file's text, or `null` when it does not exist. */
	read(path: string): Promise<string | null>;
	/** Write the file, making its folder first. */
	write(path: string, text: string): Promise<void>;
}
