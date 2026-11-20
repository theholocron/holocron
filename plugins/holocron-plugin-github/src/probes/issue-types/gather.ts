import type { BackfillApi, BackfillItem, BackfillOptions } from "./issue-types.type.js";

/** What one run reads: the items, and whether the window has more behind them. */
export interface Gathered {
	items: BackfillItem[];
	/** More lie beyond the limit, or the read was cut short by a rate limit. */
	more: boolean;
	/** The read stopped because GitHub asked it to. */
	rateLimited: boolean;
	/** Pull requests passed over because `--pull-requests` was not given. */
	pullRequestsSkipped: number;
}

/** Whether a day (`YYYY-MM-DD`) is before the start of the window. */
const before = (item: BackfillItem, since: string | undefined) =>
	since !== undefined && item.createdAt.slice(0, 10) < since;

/** The issues named by `--issues`, past the cursor, at most `limit` of them. */
async function named(
	api: BackfillApi,
	options: BackfillOptions,
	isRateLimited: (e: unknown) => boolean
): Promise<Gathered> {
	const numbers = [...new Set(options.issues)].sort((a, b) => a - b).filter((n) => n > options.after);
	const out: Gathered = {
		items: [],
		more: numbers.length > options.limit,
		rateLimited: false,
		pullRequestsSkipped: 0,
	};
	for (const number of numbers.slice(0, options.limit)) {
		try {
			const item = await api.get(number);
			if (item.isPullRequest && !options.pullRequests) out.pullRequestsSkipped++;
			else out.items.push(item);
		} catch (err) {
			if (!isRateLimited(err)) throw err;
			return { ...out, more: true, rateLimited: true };
		}
	}
	return out;
}

/**
 * The items one run looks at: with `--issues` those numbers, otherwise every issue of the repository oldest first, a
 * page at a time, past the `--after` cursor and on or after `--since`, until `--limit` are kept. Issue numbers rise with
 * creation, so the last number read is a cursor the next run can resume from. A rate limit ends the read with what it has.
 */
export async function gather(
	api: BackfillApi,
	options: BackfillOptions,
	isRateLimited: (e: unknown) => boolean
): Promise<Gathered> {
	if (options.issues) return named(api, options, isRateLimited);
	const out: Gathered = { items: [], more: false, rateLimited: false, pullRequestsSkipped: 0 };
	try {
		for (let page = 1; ; page++) {
			const batch = await api.list(page);
			if (batch.length === 0) return out;
			for (const item of batch) {
				if (item.number <= options.after || before(item, options.since)) continue;
				if (item.isPullRequest && !options.pullRequests) {
					out.pullRequestsSkipped++;
					continue;
				}
				if (out.items.length >= options.limit) return { ...out, more: true };
				out.items.push(item);
			}
		}
	} catch (err) {
		if (!isRateLimited(err)) throw err;
		return { ...out, more: true, rateLimited: true };
	}
}
