import { ConfigError } from "../../../config/index.js";

const UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * Turns the `--since` value into an ISO timestamp: a date or date and time (`2026-03-01`, `2026-03-01T09:00:00Z`) or a
 * span back from `now` (`30m`, `12h`, `7d`, `2w`). Anything else is a `ConfigError`, so a typo never reads as "all".
 */
export function parseSince(value: string, now: number = Date.now()): string {
	const span = /^(\d+)([mhdw])$/.exec(value.trim());
	if (span) return new Date(now - Number(span[1]) * UNITS[span[2]!]!).toISOString();
	const at = Date.parse(value);
	if (Number.isNaN(at)) {
		throw new ConfigError(`sync issues: --since "${value}" is not a date or a span like 30m, 12h, 7d or 2w`);
	}
	return new Date(at).toISOString();
}
