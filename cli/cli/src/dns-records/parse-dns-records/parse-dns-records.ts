import { ConfigError } from "@theholocron/kyber/config";
import { errorMessage } from "@theholocron/misc-utils";

import { DNS_ENTRY_TYPES, type DnsListEntry } from "../dns-records.type.js";

/** The list in `text`, or a `ConfigError` naming the entry that is wrong. An empty file is an empty list. */
export function parseDnsRecords(text: string, file: string): DnsListEntry[] {
	if (text.trim() === "") return [];
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		throw new ConfigError(`${file} is not JSON: ${errorMessage(err)}`);
	}
	if (!Array.isArray(raw)) throw new ConfigError(`${file} must hold an array of records`);
	return raw.map((item, i): DnsListEntry => {
		const at = `${file} entry ${i + 1}`;
		if (typeof item !== "object" || item === null) throw new ConfigError(`${at} must be an object`);
		const e = item as Record<string, unknown>;
		const type = DNS_ENTRY_TYPES.find((t) => t === e.type);
		if (!type) throw new ConfigError(`${at}: type must be one of ${DNS_ENTRY_TYPES.join(", ")}`);
		for (const key of ["name", "value"] as const) {
			if (typeof e[key] !== "string" || e[key] === "")
				throw new ConfigError(`${at}: ${key} must be a non-empty string`);
		}
		if (e.note !== undefined && typeof e.note !== "string") throw new ConfigError(`${at}: note must be a string`);
		if (e.proxied !== undefined && typeof e.proxied !== "boolean")
			throw new ConfigError(`${at}: proxied must be true or false`);
		return {
			type,
			name: e.name as string,
			value: e.value as string,
			...(e.note !== undefined ? { note: e.note } : {}),
			...(e.proxied !== undefined ? { proxied: e.proxied } : {}),
		};
	});
}
