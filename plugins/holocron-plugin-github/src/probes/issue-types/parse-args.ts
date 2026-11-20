import type { ParsedArgs } from "./issue-types.type.js";

/** The default for `--limit`: a page of issues, so one run is a few hundred requests at most. */
export const DEFAULT_LIMIT = 100;

const VALUED = ["--issues", "--since", "--after", "--limit", "--milestone", "--project"];
const INTEGER = /^\d+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE = 1000;

/** `12,15,20-23` to `[12, 15, 20, 21, 22, 23]`, or `undefined` for text that is not such a list. */
function numbersOf(text: string): number[] | undefined {
	const out: number[] = [];
	for (const part of text.split(",")) {
		const [from, to, ...rest] = part.trim().split("-");
		if (rest.length > 0 || !INTEGER.test(from)) return undefined;
		const end = to === undefined ? Number(from) : INTEGER.test(to) ? Number(to) : -1;
		if (end < Number(from) || end - Number(from) > MAX_RANGE) return undefined;
		for (let n = Number(from); n <= end; n++) out.push(n);
	}
	return out;
}

/** The words after `issue-types`, read into options, or the one thing wrong with them. */
export function parseArgs(args: readonly string[]): ParsedArgs {
	const options: Extract<ParsedArgs, { ok: true }>["options"] = {
		after: 0,
		limit: DEFAULT_LIMIT,
		pullRequests: false,
	};
	for (let i = 0; i < args.length; i++) {
		const flag = args[i];
		if (flag === "--pull-requests") {
			options.pullRequests = true;
			continue;
		}
		if (!VALUED.includes(flag)) return { ok: false, message: `unknown argument ${flag}` };
		const value = args[++i];
		if (value === undefined || value.startsWith("--")) return { ok: false, message: `${flag} needs a value` };
		if (flag === "--issues") {
			const issues = numbersOf(value);
			if (!issues)
				return { ok: false, message: `--issues takes numbers and ranges such as 12,15,20-25, not ${value}` };
			options.issues = issues;
		} else if (flag === "--since") {
			if (!DAY.test(value)) return { ok: false, message: `--since takes a day as YYYY-MM-DD, not ${value}` };
			options.since = value;
		} else if (flag === "--after") {
			if (!INTEGER.test(value)) return { ok: false, message: `--after takes a whole number, not ${value}` };
			options.after = Number(value);
		} else if (flag === "--limit") {
			if (!INTEGER.test(value) || Number(value) < 1) {
				return { ok: false, message: `--limit takes a whole number of at least 1, not ${value}` };
			}
			options.limit = Number(value);
		} else if (flag === "--milestone") options.milestone = value;
		else options.project = value;
	}
	if ((options.milestone || options.project) && !options.issues && !options.since) {
		return {
			ok: false,
			message: "--milestone and --project need a window to apply to: name it with --issues or --since",
		};
	}
	return { ok: true, options };
}
