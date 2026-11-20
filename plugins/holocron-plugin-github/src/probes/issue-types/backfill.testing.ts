import type { ProbeContext, ProbeRow } from "@theholocron/cli";
import { vi } from "vitest";

import type { BackfillApi, BackfillItem } from "./issue-types.type.js";

/** An issue as the backfill reads it, with `over` laid on top of a plain open one. */
export const item = (number: number, over: Partial<BackfillItem> = {}): BackfillItem => ({
	number,
	title: `Issue ${number}`,
	state: "open",
	labels: [],
	type: null,
	milestone: null,
	nodeId: `N${number}`,
	isPullRequest: false,
	createdAt: "2026-10-01T00:00:00Z",
	...over,
});

/** A fake provider: it answers from `data` (a milestone, a project, issues) and logs every write in `writes`. */
export function fakeApi(over: Partial<BackfillApi> = {}, data: { items?: BackfillItem[] } = {}) {
	const writes: string[] = [];
	const items = data.items ?? [];
	const api: BackfillApi = {
		list: async (page) => items.slice((page - 1) * 100, page * 100),
		get: async (number) => items.find((i) => i.number === number) ?? item(number),
		parent: async () => null,
		labelNames: async () => new Set(["area:cli", "area:sentinel", "area:plugins", "bug"]),
		milestoneNumber: async () => 7,
		projectId: async () => "P1",
		projectsOf: async () => new Map(),
		fieldNames: async () => new Set(["priority", "effort"]),
		fieldValues: async () => new Set(),
		files: async () => [],
		setType: async (n, t) => void writes.push(`type ${n} ${t}`),
		addLabels: async (n, l) => void writes.push(`labels ${n} ${l.join(",")}`),
		setMilestone: async (n, m) => void writes.push(`milestone ${n} ${m}`),
		addToProject: async (p, node) => void writes.push(`project ${p} ${node}`),
		...over,
	};
	return { api, writes };
}

/** A probe context that records what is said and, unless it is a dry run, runs the writes. */
export function fakeCtx(dryRun = false, args: string[] = []) {
	const rows: ProbeRow[] = [];
	const wrote: string[] = [];
	const ctx: ProbeContext = {
		args,
		dryRun,
		say: (row) => void rows.push(row),
		write: async (label, fn) => {
			if (dryRun) {
				wrote.push(`would ${label}`);
				return undefined;
			}
			wrote.push(label);
			return fn();
		},
		cleanup: vi.fn(),
		secret: vi.fn(),
	};
	return { ctx, rows, wrote };
}

/** The rows as `label: detail` lines, for assertions. */
export const lines = (rows: ProbeRow[]) => rows.map((r) => `${r.status} ${r.label}${r.detail ? `: ${r.detail}` : ""}`);
