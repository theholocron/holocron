import { type BoardItem, planPullRequestStatus, planReconcile } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { SENTINEL_PR_FEED_CHECK_NAME } from "../../../utils/constants/index.js";
import { issueKey } from "../issue-key/index.js";
import { loadBoardStatus } from "../load-board-status/index.js";
import { readClosingIssues } from "../read-closing-issues/index.js";
import type {
	BoardStatusApplied,
	BoardStatusFailure,
	RunBoardStatusInput,
	RunBoardStatusResult,
} from "./run-board-status.type.js";

/** The conclusions of the `ci` aggregate that are a verdict; the others (neutral, skipped, …) change nothing. */
const VERDICTS = new Set(["success", "failure", "timed_out", "cancelled"]);

/**
 * The board's statuses for one delivery (spec `tech-board-status-automation`, part 5): for each issue the delivery's
 * pull requests close, the item on each declared board is planned by the same two pure rules `reconcile project` uses,
 * `planReconcile()` (blocked and done, first) and then `planPullRequestStatus()` (active and review), and the change
 * is made through `Projects.setStatus`. Everything is read from the API, never the webhook payload. Idempotent: the
 * plan reads the board as it is, so a redelivery plans nothing, and `setStatus` is itself a no-op on a status already
 * set. A check run that is not the `ci / Required checks` verdict is dropped before anything is loaded or fetched.
 * Quietly `skipped` when `SENTINEL_ROLE_SYNC_REPO` or the config's `providers.projects` is not set up, or when the
 * pull requests close no issue. An item that cannot be moved is listed in `failed`; the hourly `reconcile-projects`
 * run is the safety net for it and for a missed delivery. Never throws.
 */
export async function runBoardStatus(input: RunBoardStatusInput): Promise<RunBoardStatusResult> {
	const { client, repo, trigger } = input;
	try {
		if (trigger.kind === "check_run") {
			if (trigger.check.name !== SENTINEL_PR_FEED_CHECK_NAME) {
				return { status: "skipped", reason: `${trigger.check.name} is not the verdict` };
			}
			if (!trigger.check.conclusion || !VERDICTS.has(trigger.check.conclusion)) {
				return { status: "skipped", reason: `a ${trigger.check.conclusion} conclusion is not a verdict` };
			}
		}
		if (trigger.numbers.length === 0) return { status: "skipped", reason: "no pull request to follow" };

		const loaded = await (input.loadBoard ?? loadBoardStatus)({ client, env: input.env, repo });
		if (!loaded.ok) return { status: "skipped", reason: loaded.reason };
		const { projects, owner, boards } = loaded;
		if (typeof projects.items !== "function" || typeof projects.setStatus !== "function") {
			return {
				status: "skipped",
				reason: `the ${projects.providerName} provider cannot list items or set a status`,
			};
		}

		const items = projects.items.bind(projects);
		const setStatus = projects.setStatus.bind(projects);
		const keys = new Set<string>();
		for (const number of trigger.numbers) {
			for (const issue of (await readClosingIssues({ client, repo, number })).issues) {
				keys.add(issueKey(issue.repo, issue.number, repo));
			}
		}
		if (keys.size === 0) return { status: "skipped", reason: "the pull request closes no issue" };

		const applied: BoardStatusApplied[] = [];
		const failed: BoardStatusFailure[] = [];
		for (const declared of boards) {
			const board = await projects.find(owner, declared.name);
			if (!board) continue;
			const onBoard = (await items(owner, board, declared.template)).filter((i) => keys.has(i.key));
			for (const item of onBoard) {
				let current: BoardItem = item;
				const move = async (key: string, to: string): Promise<void> => {
					const result = await setStatus(owner, board, key, to);
					if (result.status !== to) throw new Error(`refused: still ${result.status}`);
					if (result.transitioned) applied.push({ board: declared.name, key, from: current.status, to });
				};
				try {
					const [reconcile] = planReconcile([current], declared.template).changes;
					if (reconcile) {
						await move(reconcile.key, reconcile.to);
						current = { ...current, status: reconcile.to, category: reconcile.category };
					}
					const plan = planPullRequestStatus(current, declared.template);
					if (plan?.kind === "change") await move(plan.change.key, plan.change.to);
				} catch (err) {
					failed.push({ board: declared.name, key: item.key, message: errorMessage(err) });
				}
			}
		}
		return { status: "ok", applied, failed };
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}
}
