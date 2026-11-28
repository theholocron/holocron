import { describeError } from "@theholocron/kyber/ui";

import { openBoardContext } from "../../project/board-context/index.js";
import type { IssueBoards, ReadIssueBoardsInput } from "./issue-boards.type.js";

/** `#12`, `12`, `o/r#12` as a repository (or none) and a number; anything else (a Linear key) is undefined. */
const parseKey = (key: string): { repo: string | undefined; number: number } | undefined => {
	const m = /^(?:([^#\s]+)#|#)?(\d+)$/.exec(key.trim());
	return m ? { repo: m[1], number: Number(m[2]) } : undefined;
};

/**
 * The declared boards (`providers.projects.boards`) that hold an issue, so `start work` can put its pull request on
 * the same ones. The issue is found the way `project status` finds it: by number in this repository, or by the
 * key's own text for a tracker whose keys are not numbers. A provider that cannot list items, a board that is not
 * there or a read that fails is a `problem`, never a throw, because a board the pull request cannot join is a row and
 * not a failed run.
 */
export async function readIssueBoards(input: ReadIssueBoardsInput): Promise<IssueBoards> {
	const opened = await openBoardContext({
		loaded: input.loaded,
		context: input.context,
		loader: input.loader,
		...(input.templatesIo ? { io: input.templatesIo } : {}),
	});
	if (!opened.ok) return { boards: [], problem: [opened.reason, ...opened.problems].join("; ") };
	const { projects, owner, boards: declared, templates } = opened.context;
	if (!projects.items) {
		return { boards: [], problem: `the \`${projects.providerName}\` provider cannot list a board's items` };
	}
	const own = `${input.loaded.resolved.org ?? input.context.org ?? ""}/${input.loaded.resolved.name}`.toLowerCase();
	const wanted = input.keys.map((k) => ({ text: k.trim().toLowerCase(), parsed: parseKey(k) }));
	const holds = (itemKey: string): boolean => {
		const have = parseKey(itemKey);
		return wanted.some((w) => {
			if (!have || !w.parsed) return itemKey.trim().toLowerCase() === w.text;
			if (have.number !== w.parsed.number) return false;
			return (have.repo ?? own).toLowerCase() === (w.parsed.repo ?? own).toLowerCase();
		});
	};
	const names: string[] = [];
	const problems: string[] = [];
	for (const board of declared) {
		const template = templates[board.template];
		if (!template) {
			problems.push(`board ${board.name}: there is no template named "${board.template}"`);
			continue;
		}
		try {
			const found = await projects.find(owner, board.name);
			if (!found) {
				problems.push(`board ${board.name}: it does not exist or is closed`);
				continue;
			}
			const items = await projects.items(owner, found, template);
			if (items.some((item) => holds(item.key))) names.push(board.name);
		} catch (err) {
			problems.push(`board ${board.name}: ${describeError(err)}`);
		}
	}
	return { boards: names, ...(problems.length > 0 ? { problem: problems.join("; ") } : {}) };
}
