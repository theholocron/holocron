/**
 * `issues` capability for GitHub.
 *
 * Lifecycle model: GitHub Issues has no transitions like Jira does.
 * Holocron's three lifecycle slots map to (state, label) pairs:
 *   inProgress → open + label `status:in-progress`  (strip other status:*)
 *   inReview   → open + label `status:in-review`    (strip other status:*)
 *   done       → closed (state_reason=completed)    (strip status:* labels)
 *
 * Issue keys accept "#42", "42", or "owner/repo#42" on input; the
 * canonical display key is always "#N".
 */

import type {
	Issue,
	IssueSearchFilter,
	Issues,
	LifecycleResult,
	LifecycleSlot,
	StatusCategory,
	TrackerDoctorReport,
	TrackerUser,
} from "@theholocron/cli";
import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

export interface IssuesOptions {
	repo: string;
	/**
	 * Lifecycle slot → status label name. Optional at construction; if
	 * omitted, capability methods that need labels (`transition`,
	 * `doctor`) degrade gracefully — `transition` throws a clear error,
	 * `doctor` reports the two label-backed slots as unresolved.
	 */
	labels?: { inProgress: string; inReview: string };
}

export class GitHubIssues implements Issues {
	readonly key = "issues" as const;
	readonly providerName = "github";

	private readonly owner: string;
	private readonly repoName: string;
	private readonly repo: string;
	private readonly labels: { inProgress: string; inReview: string } | undefined;

	constructor(
		private readonly client: GitHubClient,
		opts: IssuesOptions
	) {
		const [owner = "", repoName = ""] = opts.repo.split("/", 2);
		this.owner = owner;
		this.repoName = repoName;
		this.repo = opts.repo;
		this.labels = opts.labels;
	}

	// ── identity ─────────────────────────────────────────────────────────

	async getMyself(): Promise<TrackerUser> {
		const raw = await this.client.user.getCurrentUser();
		return { id: raw.login, displayName: raw.name ?? raw.login, ...(raw.email ? { emailAddress: raw.email } : {}) };
	}

	// ── search / get ─────────────────────────────────────────────────────

	async search(filter: IssueSearchFilter): Promise<Issue[]> {
		const params: Record<string, string | number> = {
			state: filter.openOnly ? "open" : "all",
			sort: "updated",
			direction: "desc",
			per_page: filter.limit ?? 50,
			filter: "all",
		};
		if (filter.assignee === "currentUser") {
			const me = await this.getMyself();
			params.assignee = me.id;
		} else if (filter.assignee) {
			params.assignee = filter.assignee;
		}
		const raw = await this.client.issues.listIssues(this.repo, {
			state: params.state as "open" | "closed" | "all",
			sort: params.sort as string,
			direction: params.direction as string,
			per_page: Number(params.per_page),
			filter: params.filter as string,
			assignee: params.assignee as string | undefined,
		});
		return raw.filter((i) => !i.pull_request).map((i) => this.mapIssue(i));
	}

	async get(key: string): Promise<Issue> {
		const number = parseIssueNumber(key, this.owner, this.repoName);
		const raw = await this.client.issues.getIssue(this.repo, number);
		return this.mapIssue(raw);
	}

	// ── create / transition / comment ────────────────────────────────────

	async create(input: {
		summary: string;
		body?: string;
		labels?: string[];
		milestone?: string;
	}): Promise<{ key: string }> {
		const body: Record<string, unknown> = { title: input.summary };
		if (input.body) body.body = input.body;
		if (input.labels?.length) body.labels = input.labels;
		if (input.milestone) body.milestone = await this.resolveMilestone(input.milestone);
		const raw = await this.client.issues.createIssue(this.repo, body);
		return { key: `#${raw.number}` };
	}

	async transition(key: string, slot: LifecycleSlot): Promise<LifecycleResult> {
		const number = parseIssueNumber(key, this.owner, this.repoName);
		const issue = await this.client.issues.getIssue(this.repo, number);
		const currentStatusLabels = issue.labels.map((l) => l.name).filter((n) => n.startsWith("status:"));

		if (slot === "done") {
			if (issue.state === "closed") {
				return { transitioned: false, status: "closed", via: "already closed" };
			}
			await this.removeStatusLabels(number, currentStatusLabels);
			await this.client.issues.updateIssue(this.repo, number, { state: "closed", state_reason: "completed" });
			return { transitioned: true, status: "closed", via: "closed (completed)" };
		}

		if (!this.labels) {
			throw new Error(
				`transition to \`${slot}\` requires \`labels\` in plugin options: ` +
					`{ inProgress: '<label>', inReview: '<label>' }`
			);
		}
		const targetLabel = slot === "inProgress" ? this.labels.inProgress : this.labels.inReview;
		const alreadyOpen = issue.state === "open";
		const alreadyLabeled = currentStatusLabels.includes(targetLabel);
		if (alreadyOpen && alreadyLabeled && currentStatusLabels.length === 1) {
			return { transitioned: false, status: `open + ${targetLabel}`, via: "already there" };
		}

		if (!alreadyOpen) {
			await this.client.issues.updateIssue(this.repo, number, { state: "open" });
		}
		const toRemove = currentStatusLabels.filter((n) => n !== targetLabel);
		if (toRemove.length) await this.removeStatusLabels(number, toRemove);
		if (!alreadyLabeled) {
			await this.client.issues.addLabels(this.repo, number, [targetLabel]);
		}
		return { transitioned: true, status: `open + ${targetLabel}`, via: `label set to ${targetLabel}` };
	}

	async comment(key: string, body: string): Promise<void> {
		const number = parseIssueNumber(key, this.owner, this.repoName);
		await this.client.issues.createComment(this.repo, number, body);
	}

	// ── doctor ───────────────────────────────────────────────────────────

	async doctor(): Promise<TrackerDoctorReport> {
		const me = await this.getMyself();
		const repo = await this.client.repos.getRepo(this.repo);
		const allLabels = await this.client.labels.listLabels(this.repo);
		const labelNames = new Set(allLabels.map((l) => l.name));

		const statuses: TrackerDoctorReport["statuses"] = [
			{ name: "open (no status label)", category: "open" },
			...(this.labels
				? [
						{ name: `open + ${this.labels.inProgress}`, category: "in-progress" as const },
						{ name: `open + ${this.labels.inReview}`, category: "in-review" as const },
					]
				: []),
			{ name: "closed", category: "done" },
		];

		const lifecycle: TrackerDoctorReport["lifecycle"] = this.labels
			? [
					{
						slot: "inProgress",
						value: this.labels.inProgress,
						resolved: labelNames.has(this.labels.inProgress),
						note: labelNames.has(this.labels.inProgress)
							? `label exists in ${repo.full_name}`
							: "(label not defined yet — auto-created on first apply)",
					},
					{
						slot: "inReview",
						value: this.labels.inReview,
						resolved: labelNames.has(this.labels.inReview),
						note: labelNames.has(this.labels.inReview)
							? `label exists in ${repo.full_name}`
							: "(label not defined yet — auto-created on first apply)",
					},
					{ slot: "done", value: "closed (state_reason=completed)", resolved: true, note: "(intrinsic — GitHub close-with-reason)" },
				]
			: [
					{
						slot: "inProgress",
						value: null,
						resolved: false,
						note: "no `labels` configured in plugin options — transitions to `inProgress` will error",
					},
					{
						slot: "inReview",
						value: null,
						resolved: false,
						note: "no `labels` configured in plugin options — transitions to `inReview` will error",
					},
					{ slot: "done", value: "closed (state_reason=completed)", resolved: true, note: "(intrinsic — GitHub close-with-reason)" },
				];

		return {
			authedAs: `${me.displayName} (${me.emailAddress ?? me.id})`,
			projectLabel: `Repo: ${repo.full_name}`,
			statuses,
			lifecycle,
		};
	}

	// ── internals ────────────────────────────────────────────────────────

	private async resolveMilestone(ref: string): Promise<number> {
		if (/^\d+$/.test(ref)) return parseInt(ref, 10);
		const milestones = await this.client.issues.listMilestones(this.repo, { state: "all" });
		const match = milestones.find((m) => m.title.toLowerCase() === ref.toLowerCase());
		if (!match) {
			throw new Error(
				`Milestone "${ref}" not found in ${this.owner}/${this.repoName}. Use the numeric id or an exact title.`
			);
		}
		return match.number;
	}

	private async removeStatusLabels(number: number, labels: string[]): Promise<void> {
		for (const label of labels) {
			await this.client.issues.removeLabel(this.repo, number, label);
		}
	}

	private mapIssue(raw: GitHubIssue): Issue {
		const statusLabels = raw.labels.map((l) => l.name).filter((n) => n.startsWith("status:"));
		let category: StatusCategory = "open";
		let statusName = raw.state === "closed" ? "closed" : "open";
		if (raw.state === "closed") {
			category = "done";
		} else if (this.labels && statusLabels.includes(this.labels.inProgress)) {
			category = "in-progress";
			statusName = `open + ${this.labels.inProgress}`;
		} else if (this.labels && statusLabels.includes(this.labels.inReview)) {
			category = "in-review";
			statusName = `open + ${this.labels.inReview}`;
		}
		return {
			key: `#${raw.number}`,
			id: String(raw.id),
			summary: raw.title,
			...(raw.body ? { body: raw.body } : {}),
			status: statusName,
			statusCategory: category,
			assignee: raw.assignee
				? { id: raw.assignee.login, displayName: raw.assignee.name ?? raw.assignee.login, ...(raw.assignee.email ? { emailAddress: raw.assignee.email } : {}) }
				: null,
			updated: raw.updated_at,
			url: raw.html_url,
		};
	}
}

function parseIssueNumber(key: string, owner: string, repoName: string): number {
	const trimmed = key.trim();
	const crossMatch = trimmed.match(/^([^/]+)\/([^#]+)#(\d+)$/);
	if (crossMatch) {
		if (crossMatch[1] !== owner || crossMatch[2] !== repoName) {
			throw new Error(
				`Issue key "${key}" references ${crossMatch[1]}/${crossMatch[2]} but this adapter is bound to ${owner}/${repoName}.`
			);
		}
		return parseInt(crossMatch[3]!, 10);
	}
	const num = trimmed.replace(/^#/, "");
	if (!/^\d+$/.test(num)) {
		throw new Error(`Invalid GitHub issue key "${key}" — expected #N or N.`);
	}
	return parseInt(num, 10);
}
