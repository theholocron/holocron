import type { IssueKind } from "../../../plugin/index.js";
import type { WorkTitle, WorkTitleInput } from "./work-title.type.js";

const TYPES = new Set(["feat", "fix", "chore", "docs", "refactor", "perf", "test", "ci", "build", "style", "revert"]);
const KIND_TYPE: Record<IssueKind, string> = { bug: "fix", feature: "feat", task: "chore" };
const LABEL_TYPE: Record<string, string> = { bug: "fix", enhancement: "feat", documentation: "docs", chore: "chore" };

/**
 * The Conventional Commit title of the work's pull request and, with no spec, of its first commit. semantic-release
 * reads the squashed title, so the type is chosen in order: the issue's kind (Bug `fix`, Feature `feat`, Task
 * `chore`), the type the issue's own title starts with, a kind label (`bug`, `enhancement`, `documentation`,
 * `chore`), then `chore`. The scope is the one the issue's title names. A spec-only pull request is `docs(specs)`.
 */
export function workTitle(input: WorkTitleInput): WorkTitle {
	const clean = input.issueTitle.replace(/\p{Extended_Pictographic}|‍|️/gu, "").trim();
	const m = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/.exec(clean);
	const prefixed = m && TYPES.has(m[1].toLowerCase()) ? m : undefined;
	const titleType = prefixed?.[1]!.toLowerCase();
	const scope = prefixed?.[2]?.trim() || undefined;
	const subject = (prefixed ? prefixed[3] : clean).replace(/\s+/g, " ").trim();
	const finish = (type: string, reason: string, scoped?: string): WorkTitle => ({
		title: `${type}${scoped ? `(${scoped})` : ""}: ${subject}`,
		type,
		...(scoped ? { scope: scoped } : {}),
		subject,
		reason,
	});

	if (input.specOnly) return finish("docs", "the pull request carries only the spec", "specs");
	if (input.kind) return finish(KIND_TYPE[input.kind], `the issue's kind is ${input.kind}`, scope);
	if (titleType) return finish(titleType, "the issue's title says so", scope);
	for (const label of input.labels ?? []) {
		const type = LABEL_TYPE[label.toLowerCase()];
		if (type) return finish(type, `the issue has the label ${label}`, scope);
	}
	return finish("chore", "the issue has no kind; chore is the default, `update work --title` changes it", scope);
}
