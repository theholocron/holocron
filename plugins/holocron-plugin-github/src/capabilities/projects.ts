/**
 * `projects` capability for GitHub: boards are Projects v2, reached over GraphQL.
 *
 * Vocabulary: a board is a project (its `id` is the node id, `number` the project number), a status is an option of
 * the single select field `Status`, an item is an issue or pull request named by its `issues` key (`#42` in the
 * configured repo, `owner/repo#42` elsewhere), a rule is a project workflow.
 *
 * The one dangerous write is `updateProjectV2Field`: it replaces a single select field's whole option list, and an
 * option sent without its `id` gets a new identity, which blanks the field on every item. So `ensure()` reads the
 * field first, sends every existing option with its `id`, keeps a snapshot of the item values and writes them back by
 * name if a re-read shows any gone.
 */

import type {
	BoardField,
	BoardFieldType,
	BoardItem,
	BoardRule,
	BoardState,
	BoardStatusCategory,
	BoardSummary,
	BoardTemplate,
	BoardView,
	EnsureReport,
	LifecycleResult,
	MoveReport,
	Projects,
} from "@theholocron/cli";
import type { GraphQLClient } from "@theholocron/github-client";

/** Options of the GitHub `projects` capability. */
export interface ProjectsOptions {
	/** The repository the provider is configured for, as `owner/name`; its items get the short key `#N`. */
	repo: string;
}

/** The name of the single select field that holds an item's status. */
const STATUS_FIELD = "Status";
/** The name of the field `move` carries over besides the status. */
const PRIORITY_FIELD = "Priority";

interface RawOption {
	id: string;
	name: string;
	color: string;
	description: string;
}

interface RawField {
	id: string;
	name: string;
	dataType: string;
	options?: RawOption[];
}

interface RawView {
	id: string;
	name: string;
	layout: string;
	filter: string | null;
	groupBy: string[];
}

interface RawBoard {
	summary: BoardSummary;
	fields: RawField[];
	views: RawView[];
	rules: Array<BoardRule & { id: string }>;
}

interface RawItem {
	id: string;
	contentId: string;
	repo: string;
	number: number;
	title: string;
	open: boolean;
	values: Record<string, string>;
	blockers: Array<{ repo: string; number: number }>;
}

interface ProjectNode {
	id: string;
	number: number;
	title: string;
	closed: boolean;
	url: string;
}

const PROJECT_FIELDS = "id number title closed url";

const BOARD_QUERY = `query($id: ID!) { node(id: $id) { ... on ProjectV2 {
	${PROJECT_FIELDS}
	fields(first: 100) { nodes {
		... on ProjectV2FieldCommon { id name dataType }
		... on ProjectV2SingleSelectField { options { id name color description } }
	} }
	views(first: 50) { nodes { id name layout filter groupByFields(first: 5) { nodes { ... on ProjectV2FieldCommon { name } } } } }
	workflows(first: 50) { nodes { id name enabled } }
} } }`;

const ITEMS_QUERY = `query($id: ID!, $after: String) { node(id: $id) { ... on ProjectV2 {
	items(first: 100, after: $after) {
		pageInfo { hasNextPage endCursor }
		nodes {
			id
			fieldValues(first: 30) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } } } }
			content {
				__typename
				... on Issue { id number title state repository { nameWithOwner } blockedBy(first: 50) { nodes { number state repository { nameWithOwner } } } }
				... on PullRequest { id number title state repository { nameWithOwner } }
			}
		}
	}
} } }`;

const LIST_QUERY = `query($owner: String!, $after: String) { organization(login: $owner) { id projectsV2(first: 100, after: $after) {
	pageInfo { hasNextPage endCursor }
	nodes { ${PROJECT_FIELDS} }
} } }`;

const OWNER_QUERY = "query($owner: String!) { organization(login: $owner) { id } }";

const SET_VALUE = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
	updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
}`;

const UPDATE_OPTIONS = `mutation($field: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
	updateProjectV2Field(input: { fieldId: $field, singleSelectOptions: $options }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
}`;

const DATA_TYPES: Record<BoardFieldType, string> = {
	single_select: "SINGLE_SELECT",
	text: "TEXT",
	number: "NUMBER",
	date: "DATE",
	iteration: "ITERATION",
};

function fieldTypeOf(dataType: string): BoardFieldType | undefined {
	return (Object.keys(DATA_TYPES) as BoardFieldType[]).find((t) => DATA_TYPES[t] === dataType);
}

function toSummary(n: ProjectNode): BoardSummary {
	return { id: n.id, number: n.number, name: n.title, url: n.url, closed: n.closed };
}

function toOptionInput(o: { id?: string; name: string; color?: string; description?: string }) {
	return {
		...(o.id ? { id: o.id } : {}),
		name: o.name,
		color: (o.color ?? "GRAY").toUpperCase(),
		description: o.description ?? "",
	};
}

/** The GitHub implementation of the `projects` capability, backed by Projects v2. */
export class GitHubProjects implements Projects {
	/** Capability key, always `"projects"`. */
	readonly key = "projects" as const;
	/** Provider name, always `"github"`. */
	readonly providerName = "github";

	private readonly repo: string;

	constructor(
		private readonly graphql: GraphQLClient,
		opts: ProjectsOptions
	) {
		this.repo = opts.repo;
	}

	// ── boards ───────────────────────────────────────────────────────────

	/** Every board of the organization, open and closed. */
	async list(owner: string): Promise<BoardSummary[]> {
		const boards: BoardSummary[] = [];
		let after: string | null = null;
		for (;;) {
			const data: ListData = await this.graphql.query<ListData>(LIST_QUERY, { owner, after });
			const page = data.organization.projectsV2;
			boards.push(...page.nodes.map(toSummary));
			if (!page.pageInfo.hasNextPage) return boards;
			after = page.pageInfo.endCursor;
		}
	}

	/** The open board with exactly this name. */
	async find(owner: string, name: string): Promise<BoardSummary | undefined> {
		return (await this.list(owner)).find((b) => !b.closed && b.name === name);
	}

	/**
	 * Makes a board. With `template.source` naming an open board it is copied (fields, options, views and automation
	 * rules, no items); otherwise the board is created and brought in line with the template.
	 */
	async create(owner: string, name: string, template: BoardTemplate): Promise<BoardSummary> {
		const ownerId = await this.ownerId(owner);
		const source = template.source ? await this.find(owner, template.source) : undefined;
		if (source) {
			const data = await this.graphql.query<{ copyProjectV2: { projectV2: ProjectNode } }>(
				`mutation($project: ID!, $owner: ID!, $title: String!) {
	copyProjectV2(input: { projectId: $project, ownerId: $owner, title: $title, includeDraftIssues: false }) { projectV2 { ${PROJECT_FIELDS} } }
}`,
				{ project: source.id, owner: ownerId, title: name }
			);
			return toSummary(data.copyProjectV2.projectV2);
		}
		const data = await this.graphql.query<{ createProjectV2: { projectV2: ProjectNode } }>(
			`mutation($owner: ID!, $title: String!) {
	createProjectV2(input: { ownerId: $owner, title: $title }) { projectV2 { ${PROJECT_FIELDS} } }
}`,
			{ owner: ownerId, title: name }
		);
		const board = toSummary(data.createProjectV2.projectV2);
		await this.ensure(owner, board, template);
		return board;
	}

	/** Closes the board; `updateProjectV2` with `closed: true` is the only way, and reversible. */
	async close(_owner: string, board: BoardSummary): Promise<void> {
		await this.graphql.query(
			`mutation($project: ID!) { updateProjectV2(input: { projectId: $project, closed: true }) { projectV2 { id } } }`,
			{ project: board.id }
		);
	}

	// ── read ─────────────────────────────────────────────────────────────

	/** The live board: statuses, other fields, views and automation rules. */
	async read(_owner: string, board: BoardSummary): Promise<BoardState> {
		const raw = await this.readRaw(board.id);
		const status = raw.fields.find((f) => f.name === STATUS_FIELD);
		const fields: BoardField[] = [];
		for (const f of raw.fields) {
			const type = fieldTypeOf(f.dataType);
			if (!type || f.name === STATUS_FIELD) continue;
			fields.push({ name: f.name, type, ...(f.options ? { options: f.options.map((o) => o.name) } : {}) });
		}
		const views: BoardView[] = [];
		for (const v of raw.views) {
			const layout = v.layout === "BOARD_LAYOUT" ? "board" : v.layout === "TABLE_LAYOUT" ? "table" : undefined;
			if (!layout) continue;
			views.push({
				name: v.name,
				layout,
				...(v.filter ? { filter: v.filter } : {}),
				...(v.groupBy[0] ? { groupBy: v.groupBy[0] } : {}),
			});
		}
		return {
			board: raw.summary,
			statuses: (status?.options ?? []).map((o) => o.name),
			fields,
			views,
			rules: raw.rules.map(({ name, enabled }) => ({ name, enabled })),
		};
	}

	// ── ensure ───────────────────────────────────────────────────────────

	/**
	 * Brings the board in line with the template. Never deletes a field, option or view, and never sends an option
	 * list without ids. Stops (throws) when the status field cannot be read.
	 */
	async ensure(_owner: string, board: BoardSummary, template: BoardTemplate): Promise<EnsureReport> {
		const raw = await this.readRaw(board.id);
		const status = raw.fields.find((f) => f.name === STATUS_FIELD && f.options);
		if (!status) {
			throw new Error(
				`cannot read the "${STATUS_FIELD}" field of board "${board.name}"; stopped before any write so no item loses its status`
			);
		}
		const changes: string[] = [];
		const todos: string[] = [];

		const statusChanges = await this.ensureOptions(
			board,
			status,
			template.statuses.map((s) => ({ name: s.name, color: s.color, description: s.description }))
		);
		changes.push(...statusChanges.map((c) => `status ${c}`));

		for (const want of template.fields) {
			const have = raw.fields.find((f) => f.name === want.name);
			if (!have) {
				await this.createField(board.id, want);
				changes.push(`field ${want.name} created`);
				continue;
			}
			if (fieldTypeOf(have.dataType) !== want.type) {
				todos.push(
					`field "${want.name}" is ${have.dataType} but the template says ${want.type}; change it by hand`
				);
				continue;
			}
			if (want.type === "single_select" && have.options && want.options) {
				const diff = await this.ensureOptions(
					board,
					have,
					want.options.map((name) => ({ name }))
				);
				changes.push(...diff.map((c) => `field ${want.name} option ${c}`));
			}
		}

		for (const want of template.views) {
			const have = raw.views.find((v) => v.name === want.name);
			const layout = want.layout === "board" ? "BOARD_LAYOUT" : "TABLE_LAYOUT";
			let viewId = have?.id;
			if (!viewId) {
				viewId = await this.createView(board.id, want.name, layout);
				changes.push(`view ${want.name} created`);
			} else if (have && have.layout !== layout) {
				await this.updateView(viewId, { layout });
				changes.push(`view ${want.name} layout set to ${want.layout}`);
			}
			if (want.filter !== undefined && want.filter !== (have?.filter ?? "")) {
				await this.updateView(viewId, { filter: want.filter });
				changes.push(`view ${want.name} filter set`);
			}
			if (want.groupBy && have?.groupBy[0] !== want.groupBy) {
				todos.push(`group view "${want.name}" by ${want.groupBy}; the API cannot set a view's grouping`);
			}
		}

		for (const rule of template.rules ?? []) {
			const have = raw.rules.find((r) => r.name === rule);
			if (!have) todos.push(`create the automation rule "${rule}"; the API cannot create one`);
			else if (!have.enabled) todos.push(`turn on the automation rule "${rule}"; the API cannot switch one`);
		}

		return { created: false, changes, todos };
	}

	/**
	 * Makes a single select field hold the wanted options in order, every existing one sent with its id. Options the
	 * template does not mention stay, after the wanted ones. Returns what changed (`Blocked added`, `order set`).
	 */
	private async ensureOptions(
		board: BoardSummary,
		field: RawField,
		wanted: Array<{ name: string; color?: string; description?: string }>
	): Promise<string[]> {
		const existing = field.options ?? [];
		const next: Array<{ id?: string; name: string; color: string; description: string }> = [];
		const changes: string[] = [];
		for (const w of wanted) {
			const have = existing.find((o) => o.name === w.name);
			if (have) {
				next.push({
					id: have.id,
					name: have.name,
					color: (w.color ?? have.color).toUpperCase(),
					description: w.description ?? have.description,
				});
				if (
					next[next.length - 1]!.color !== have.color ||
					next[next.length - 1]!.description !== have.description
				) {
					changes.push(`${have.name} updated`);
				}
			} else {
				next.push({ name: w.name, color: (w.color ?? "GRAY").toUpperCase(), description: w.description ?? "" });
				changes.push(`${w.name} added`);
			}
		}
		for (const have of existing) {
			if (!next.some((n) => n.id === have.id)) next.push({ ...have });
		}
		const sameOrder = next.length === existing.length && next.every((n, i) => n.id === existing[i]?.id);
		if (changes.length === 0 && sameOrder) return [];
		if (sameOrder === false && !changes.some((c) => c.endsWith("added"))) changes.push("order set");

		const before = await this.fetchItems(board.id);
		const snapshot = new Map<string, string>();
		for (const item of before) {
			const value = item.values[field.name];
			if (value) snapshot.set(item.id, value);
		}

		await this.graphql.query(UPDATE_OPTIONS, { field: field.id, options: next.map(toOptionInput) });

		const afterRaw = await this.readRaw(board.id);
		const afterField = afterRaw.fields.find((f) => f.id === field.id);
		const afterItems = await this.fetchItems(board.id);
		const afterValues = new Map(afterItems.map((i) => [i.id, i.values[field.name]]));
		const lost = [...snapshot].filter(([itemId]) => !afterValues.get(itemId));
		if (lost.length > 0) {
			let restored = 0;
			for (const [itemId, name] of lost) {
				const option = afterField?.options?.find((o) => o.name === name);
				if (!option) continue;
				await this.graphql.query(SET_VALUE, {
					project: board.id,
					item: itemId,
					field: field.id,
					option: option.id,
				});
				restored++;
			}
			throw new Error(
				`updating "${field.name}" on board "${board.name}" blanked ${lost.length} item value(s); wrote ${restored} back by option name`
			);
		}
		return changes;
	}

	private async createField(projectId: string, want: BoardField): Promise<void> {
		await this.graphql.query(
			`mutation($project: ID!, $name: String!, $type: ProjectV2CustomFieldType!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
	createProjectV2Field(input: { projectId: $project, name: $name, dataType: $type, singleSelectOptions: $options }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
}`,
			{
				project: projectId,
				name: want.name,
				type: DATA_TYPES[want.type],
				options:
					want.type === "single_select"
						? (want.options ?? []).map((name) => toOptionInput({ name }))
						: undefined,
			}
		);
	}

	private async createView(projectId: string, name: string, layout: string): Promise<string> {
		const data = await this.graphql.query<{ createProjectV2View: { projectV2View: { id: string } } }>(
			`mutation($project: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
	createProjectV2View(input: { projectId: $project, name: $name, layout: $layout }) { projectV2View { id } }
}`,
			{ project: projectId, name, layout }
		);
		return data.createProjectV2View.projectV2View.id;
	}

	private async updateView(viewId: string, change: { layout?: string; filter?: string }): Promise<void> {
		await this.graphql.query(
			`mutation($view: ID!, $layout: ProjectV2ViewLayout, $filter: String) {
	updateProjectV2View(input: { viewId: $view, layout: $layout, filter: $filter }) { projectV2View { id } }
}`,
			{ view: viewId, layout: change.layout, filter: change.filter }
		);
	}

	// ── items ────────────────────────────────────────────────────────────

	/** The board's issues and pull requests with their status, whether they are open and their open blockers. */
	async items(_owner: string, board: BoardSummary, template: BoardTemplate): Promise<BoardItem[]> {
		const categories = new Map<string, BoardStatusCategory>(template.statuses.map((s) => [s.name, s.category]));
		return (await this.fetchItems(board.id)).map((i) => {
			const status = i.values[STATUS_FIELD];
			const category = status ? categories.get(status) : undefined;
			return {
				key: this.keyOf(i.repo, i.number),
				title: i.title,
				open: i.open,
				...(status ? { status } : {}),
				...(category ? { category } : {}),
				blockedBy: i.blockers.map((b) => this.keyOf(b.repo, b.number)),
			};
		});
	}

	/** Puts an item in a status; `transitioned` is false when it already is there. */
	async setStatus(_owner: string, board: BoardSummary, key: string, status: string): Promise<LifecycleResult> {
		const ref = this.parseKey(key);
		const raw = await this.readRaw(board.id);
		const field = raw.fields.find((f) => f.name === STATUS_FIELD && f.options);
		const option = field?.options?.find((o) => o.name === status);
		if (!field || !option) {
			throw new Error(`board "${board.name}" has no status "${status}"`);
		}
		const item = (await this.fetchItems(board.id)).find((i) => i.repo === ref.repo && i.number === ref.number);
		if (!item) throw new Error(`${key} is not on board "${board.name}"`);
		if (item.values[STATUS_FIELD] === status) return { transitioned: false, status };
		await this.graphql.query(SET_VALUE, { project: board.id, item: item.id, field: field.id, option: option.id });
		return { transitioned: true, status, via: "project field set" };
	}

	/**
	 * Puts the open items of `from` on `to` with their status and priority, only where the target has no value;
	 * closed and merged ones stay, and are set to the template's done status when theirs is not a done one.
	 */
	async move(_owner: string, from: BoardSummary, to: BoardSummary, template: BoardTemplate): Promise<MoveReport> {
		const report: MoveReport = { moved: [], kept: [], left: [] };
		const [source, target, fromRaw, toRaw] = await Promise.all([
			this.fetchItems(from.id),
			this.fetchItems(to.id),
			this.readRaw(from.id),
			this.readRaw(to.id),
		]);
		const done = template.statuses.find((s) => s.category === "done")?.name;
		const doneNames = new Set(template.statuses.filter((s) => s.category === "done").map((s) => s.name));
		const carried = [STATUS_FIELD, PRIORITY_FIELD];

		for (const item of source) {
			const key = this.keyOf(item.repo, item.number);
			if (!item.open) {
				const current = item.values[STATUS_FIELD];
				if (done && (!current || !doneNames.has(current))) {
					await this.setOption(from.id, fromRaw, item.id, STATUS_FIELD, done);
				}
				report.left.push(key);
				continue;
			}
			let targetItem = target.find((t) => t.contentId === item.contentId);
			if (targetItem) {
				report.kept.push(key);
			} else {
				const data = await this.graphql.query<{ addProjectV2ItemById: { item: { id: string } } }>(
					`mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`,
					{ project: to.id, content: item.contentId }
				);
				targetItem = { ...item, id: data.addProjectV2ItemById.item.id, values: {} };
				report.moved.push(key);
			}
			for (const name of carried) {
				const value = item.values[name];
				if (value && !targetItem.values[name]) {
					await this.setOption(to.id, toRaw, targetItem.id, name, value);
				}
			}
		}
		return report;
	}

	/** A `holocron doctor` smoke check: how many boards the token sees in the configured repository's organization. */
	async whoami(): Promise<{ ok: boolean; boards: number }> {
		try {
			const boards = await this.list(this.repo.split("/")[0] ?? "");
			return { ok: true, boards: boards.length };
		} catch {
			return { ok: false, boards: 0 };
		}
	}

	// ── internals ────────────────────────────────────────────────────────

	/** Sets a single select value by option name; a field or option the board lacks is skipped. */
	private async setOption(
		projectId: string,
		raw: RawBoard,
		itemId: string,
		fieldName: string,
		optionName: string
	): Promise<void> {
		const field = raw.fields.find((f) => f.name === fieldName && f.options);
		const option = field?.options?.find((o) => o.name === optionName);
		if (!field || !option) return;
		await this.graphql.query(SET_VALUE, { project: projectId, item: itemId, field: field.id, option: option.id });
	}

	private async ownerId(owner: string): Promise<string> {
		const data = await this.graphql.query<{ organization: { id: string } }>(OWNER_QUERY, { owner });
		return data.organization.id;
	}

	private async readRaw(id: string): Promise<RawBoard> {
		const data = await this.graphql.query<{ node: BoardNode | null }>(BOARD_QUERY, { id });
		const n = data.node;
		if (!n) throw new Error(`board ${id} not found`);
		return {
			summary: toSummary(n),
			fields: n.fields.nodes
				.filter((f) => f.id)
				.map((f) => ({
					id: f.id,
					name: f.name,
					dataType: f.dataType,
					...(f.options ? { options: f.options } : {}),
				})),
			views: n.views.nodes.map((v) => ({
				id: v.id,
				name: v.name,
				layout: v.layout,
				filter: v.filter,
				groupBy: (v.groupByFields?.nodes ?? []).map((g) => g.name),
			})),
			rules: n.workflows.nodes.map((w) => ({ id: w.id, name: w.name, enabled: w.enabled })),
		};
	}

	private async fetchItems(id: string): Promise<RawItem[]> {
		const items: RawItem[] = [];
		let after: string | null = null;
		for (;;) {
			const data: { node: { items: ItemsPage } } = await this.graphql.query<{ node: { items: ItemsPage } }>(
				ITEMS_QUERY,
				{ id, after }
			);
			const page = data.node.items;
			for (const n of page.nodes) {
				const c = n.content;
				if (!c || !c.repository) continue;
				const values: Record<string, string> = {};
				for (const v of n.fieldValues.nodes) {
					if (v.name && v.field?.name) values[v.field.name] = v.name;
				}
				items.push({
					id: n.id,
					contentId: c.id,
					repo: c.repository.nameWithOwner,
					number: c.number,
					title: c.title,
					open: c.state === "OPEN",
					values,
					blockers: (c.blockedBy?.nodes ?? [])
						.filter((b) => b.state === "OPEN")
						.map((b) => ({ repo: b.repository.nameWithOwner, number: b.number })),
				});
			}
			if (!page.pageInfo.hasNextPage) return items;
			after = page.pageInfo.endCursor;
		}
	}

	private keyOf(repo: string, number: number): string {
		return repo === this.repo ? `#${number}` : `${repo}#${number}`;
	}

	private parseKey(key: string): { repo: string; number: number } {
		const m = /^(?:([^#\s]+))?#?(\d+)$/.exec(key.trim());
		const hasRepo = key.includes("#") && m?.[1];
		if (!m) throw new Error(`not an issue key: ${key}`);
		return { repo: hasRepo ? m[1]! : this.repo, number: Number(m[2]) };
	}
}

interface ListData {
	organization: {
		projectsV2: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProjectNode[] };
	};
}

interface BoardNode extends ProjectNode {
	fields: { nodes: Array<{ id: string; name: string; dataType: string; options?: RawOption[] }> };
	views: {
		nodes: Array<{
			id: string;
			name: string;
			layout: string;
			filter: string | null;
			groupByFields?: { nodes: Array<{ name: string }> };
		}>;
	};
	workflows: { nodes: Array<{ id: string; name: string; enabled: boolean }> };
}

interface ItemsPage {
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
	nodes: Array<{
		id: string;
		fieldValues: { nodes: Array<{ name?: string; field?: { name?: string } }> };
		content: {
			id: string;
			number: number;
			title: string;
			state: string;
			repository: { nameWithOwner: string };
			blockedBy?: { nodes: Array<{ number: number; state: string; repository: { nameWithOwner: string } }> };
		} | null;
	}>;
}
