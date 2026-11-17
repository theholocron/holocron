/**
 * Status pages for the Checkly `monitoring` capability (spec `tech-monitoring-dashboards-status-pages`, #2302).
 *
 * A page is found by its exact name and made if absent. Its components are upserted by name in the declared order; a
 * component with a `group` sits under a `GROUP` component of that name (made if absent). A component holds no check: an
 * automation rule ties them, so each component gets one rule, named like it, whose `tags` are the component's and whose
 * `components` lists it with a full-outage impact. Nothing is ever deleted: a component, group or rule the config no
 * longer lists is left alone and the doctor reports it. A field the config leaves out is left alone on an existing
 * resource. With `automation: false` (a plan without automated incidents) no rule is read or made.
 */

import type {
	MonitoringStatusComponentInput,
	MonitoringStatusPageInput,
	MonitoringStatusPageResult,
	MonitoringStatusPageState,
} from "@theholocron/cli";

import type {
	ChecklyClient,
	CustomDomainVerification,
	StatusComponent,
	StatusPage,
	StatusPageInput,
	StatusRule,
	StatusRuleImpact,
} from "../rest.js";

/** What a failing check does to a component's status: the full outage (the spec's choice; a milder impact is later). */
const IMPACT: StatusRuleImpact = "MAJOR_OUTAGE";

/** The fields of a page that can be written back (Checkly rejects the read-only ones). */
const PAGE_FIELDS = [
	"name",
	"description",
	"url",
	"customDomain",
	"themeColors",
	"logo",
	"logoDark",
	"redirectTo",
	"favicon",
	"defaultTheme",
	"privacyPolicyLink",
	"termsOfServiceLink",
	"supportLink",
	"footerText",
	"googleAnalyticsTag",
	"allowIndexing",
	"isPrivate",
] as const satisfies readonly (keyof StatusPageInput)[];

/** The page as a write body: what it has now, so a PUT, which replaces, changes nothing it was not asked to. */
function writable(page: StatusPage): StatusPageInput {
	const out: Record<string, unknown> = {};
	for (const key of PAGE_FIELDS) if (page[key] !== undefined) out[key] = page[key];
	return out as unknown as StatusPageInput;
}

/** The page fields the config states, in Checkly's names. */
function declaredFields(input: MonitoringStatusPageInput): Partial<StatusPageInput> {
	return {
		url: input.slug,
		...(input.domain !== undefined ? { customDomain: input.domain.toLowerCase() } : {}),
		...(input.description !== undefined ? { description: input.description } : {}),
		...(input.logo !== undefined ? { logo: input.logo } : {}),
		...(input.private !== undefined ? { isPrivate: input.private } : {}),
	};
}

async function findPage(client: ChecklyClient, name: string): Promise<StatusPage | undefined> {
	return (await client.statusPages.list()).find((p) => p.name === name);
}

/** The order a declared component is shown at: top-level items (groups and ungrouped components) by first appearance. */
function layout(components: readonly MonitoringStatusComponentInput[]) {
	const groups: string[] = [];
	const top: Array<{ kind: "group"; name: string } | { kind: "service"; name: string }> = [];
	const inGroup = new Map<string, string[]>();
	for (const c of components) {
		if (c.group === undefined) {
			top.push({ kind: "service", name: c.name });
			continue;
		}
		if (!groups.includes(c.group)) {
			groups.push(c.group);
			top.push({ kind: "group", name: c.group });
		}
		inGroup.set(c.group, [...(inGroup.get(c.group) ?? []), c.name]);
	}
	const order = new Map<string, number>();
	top.forEach((t, i) => order.set(`${t.kind}:${t.name}`, i));
	for (const [group, names] of inGroup) names.forEach((n, i) => order.set(`child:${group}:${n}`, i));
	return { groups, order };
}

/** Whether a rule already does what the declaration asks: the tags are held and the component is hit at full outage. */
function ruleOk(rule: StatusRule | undefined, tags: readonly string[], componentId: string): boolean {
	if (!rule) return false;
	return (
		tags.every((t) => rule.tags.includes(t)) &&
		rule.components.some((c) => c.componentId === componentId && c.targetImpact === IMPACT)
	);
}

/** Whether Checkly has accepted the custom domain and issued its certificate. */
function isVerified(v: CustomDomainVerification): boolean {
	return v.status === "active" && v.sslStatus === "active";
}

/**
 * The records to make for a domain that is not verified: the `CNAME` the domain points at (Checkly's `CNAME` field,
 * else its ownership record when that is a CNAME) and any `TXT` record it asks for (ownership, certificate).
 */
function recordsFor(domain: string, v: CustomDomainVerification) {
	const ownership = v.ownershipVerification;
	const target = v.CNAME ?? (ownership?.type === "cname" ? ownership.value : undefined);
	const record = target ? { type: "CNAME" as const, name: domain, value: target } : undefined;
	const txt = [
		...(ownership?.type === "txt" ? [{ type: "TXT" as const, name: ownership.name, value: ownership.value }] : []),
		...(v.validationRecords ?? []).map((r) => ({ type: "TXT" as const, name: r.txt_name, value: r.txt_value })),
	];
	return { record, txt };
}

/** Find or make the page, its components and their rules, and report the custom domain's state. Never deletes. */
export async function ensureStatusPage(
	client: ChecklyClient,
	input: MonitoringStatusPageInput
): Promise<MonitoringStatusPageResult> {
	const api = client.statusPages;
	const wanted = declaredFields(input);
	let page = await findPage(client, input.name);
	const created = page === undefined;
	const pageUpdated: string[] = [];
	if (!page) {
		// A new page is public unless it says otherwise: the point of it is that people can read it.
		page = await api.create({ name: input.name, isPrivate: false, ...wanted } as StatusPageInput);
	} else {
		const have = writable(page);
		const changed = (Object.keys(wanted) as (keyof StatusPageInput)[]).filter((k) => have[k] !== wanted[k]);
		if (changed.length > 0) {
			page = await api.update(page.id, { ...have, ...wanted });
			pageUpdated.push(
				...changed.map((k) => (k === "url" ? "slug" : k === "customDomain" ? "domain" : String(k)))
			);
		}
	}

	const existing = await api.components.list(page.id);
	const { groups, order } = layout(input.components);
	const made: string[] = [];
	const changedComponents: string[] = [];

	// Groups first, so a service can name its parent.
	const groupIds = new Map<string, string>();
	for (const name of groups) {
		const displayOrder = order.get(`group:${name}`)!;
		const found = existing.find((c) => c.type === "GROUP" && c.name === name);
		if (!found) {
			const group = await api.components.create(page.id, { name, type: "GROUP", displayOrder });
			groupIds.set(name, group.id);
			made.push(name);
		} else {
			groupIds.set(name, found.id);
			if (found.displayOrder !== displayOrder) {
				await api.components.update(page.id, found.id, {
					name,
					type: "GROUP",
					displayOrder,
					description: found.description ?? null,
					hidden: found.hidden ?? false,
					parentId: found.parentId ?? null,
					configuration: found.configuration,
				});
				changedComponents.push(name);
			}
		}
	}

	const componentIds = new Map<string, string>();
	for (const c of input.components) {
		const displayOrder =
			c.group === undefined ? order.get(`service:${c.name}`)! : order.get(`child:${c.group}:${c.name}`)!;
		const parentId = c.group === undefined ? undefined : groupIds.get(c.group);
		const found = existing.find((e) => e.type === "SERVICE" && e.name === c.name);
		if (!found) {
			const service = await api.components.create(page.id, {
				name: c.name,
				type: "SERVICE",
				displayOrder,
				...(c.description !== undefined ? { description: c.description } : {}),
				...(parentId !== undefined ? { parentId } : {}),
			});
			componentIds.set(c.name, service.id);
			made.push(c.name);
			continue;
		}
		componentIds.set(c.name, found.id);
		const differs =
			found.displayOrder !== displayOrder ||
			(parentId !== undefined && (found.parentId ?? null) !== parentId) ||
			(c.description !== undefined && (found.description ?? null) !== c.description);
		if (differs) {
			await api.components.update(page.id, found.id, {
				name: c.name,
				type: "SERVICE",
				displayOrder,
				description: c.description !== undefined ? c.description : (found.description ?? null),
				hidden: found.hidden ?? false,
				parentId: parentId !== undefined ? parentId : (found.parentId ?? null),
				configuration: found.configuration,
			});
			changedComponents.push(c.name);
		}
	}

	const rulesMade: string[] = [];
	const rulesChanged: string[] = [];
	const automated = input.automation !== false;
	const rules = automated ? await api.rules.list(page.id) : [];
	for (const c of automated ? input.components : []) {
		const componentId = componentIds.get(c.name)!;
		const rule = rules.find((r) => r.name === c.name);
		if (ruleOk(rule, c.tags, componentId)) continue;
		if (!rule) {
			await api.rules.create(page.id, {
				name: c.name,
				firstUpdate: `${c.name} is failing its checks.`,
				lastUpdate: `${c.name} is passing its checks again.`,
				tags: c.tags,
				components: [{ componentId, targetImpact: IMPACT }],
			});
			rulesMade.push(c.name);
			continue;
		}
		// Keep what the rule has (its texts, switches, other components and tags) and add what the declaration needs.
		await api.rules.update(page.id, rule.id, {
			name: rule.name,
			firstUpdate: rule.firstUpdate,
			lastUpdate: rule.lastUpdate,
			tags: [...new Set([...rule.tags, ...c.tags])],
			...(rule.enabled !== undefined ? { enabled: rule.enabled } : {}),
			...(rule.notifySubscribers !== undefined ? { notifySubscribers: rule.notifySubscribers } : {}),
			...(rule.coolDownWindowMinutes !== undefined ? { coolDownWindowMinutes: rule.coolDownWindowMinutes } : {}),
			components: [
				...rule.components
					.filter((e) => e.componentId !== componentId)
					.map(({ componentId: id, targetImpact }) => ({ componentId: id, targetImpact })),
				{ componentId, targetImpact: IMPACT },
			],
		});
		rulesChanged.push(c.name);
	}

	return {
		id: page.id,
		created,
		...(pageUpdated.length > 0 ? { updated: pageUpdated } : {}),
		components: { created: made, updated: changedComponents },
		rules: { created: rulesMade, updated: rulesChanged },
		...(input.domain !== undefined ? { domain: await domainState(client, page.id, input.domain) } : {}),
	};
}

/** The custom domain's state; asks Checkly to look again first when it is not verified. */
async function domainState(client: ChecklyClient, pageId: string, domain: string) {
	let verification = await client.statusPages.customDomain.verification(pageId);
	if (!isVerified(verification)) verification = await client.statusPages.customDomain.recheck(pageId);
	if (isVerified(verification)) return { name: domain, verified: true };
	const { record, txt } = recordsFor(domain, verification);
	return {
		name: domain,
		verified: false,
		...(record ? { record } : {}),
		...(txt.length > 0 ? { extraRecords: txt } : {}),
	};
}

/** Read the page and compare it with the declaration. Read-only: the one thing it asks Checkly is the domain's state. */
export async function inspectStatusPage(
	client: ChecklyClient,
	input: MonitoringStatusPageInput
): Promise<MonitoringStatusPageState> {
	const page = await findPage(client, input.name);
	if (!page) {
		return {
			exists: false,
			domainProblems: [],
			missingComponents: [],
			misplacedComponents: [],
			missingRules: [],
			extraComponents: [],
			extraRules: [],
		};
	}

	const api = client.statusPages;
	const automated = input.automation !== false;
	const [components, rules] = await Promise.all([
		api.components.list(page.id),
		automated ? api.rules.list(page.id) : Promise.resolve([]),
	]);
	const { groups, order } = layout(input.components);
	const byId = new Map(components.map((c) => [c.id, c]));

	const declaredNames = new Set([...input.components.map((c) => c.name), ...groups]);
	const services = new Map<string, StatusComponent>();
	for (const c of components) if (c.type === "SERVICE") services.set(c.name, c);
	const missing: string[] = [];
	const misplaced: string[] = [];
	const missingRules: string[] = [];
	for (const name of groups) {
		const g = components.find((c) => c.type === "GROUP" && c.name === name);
		if (!g) missing.push(name);
		else if (g.displayOrder !== order.get(`group:${name}`)) misplaced.push(`${name}: order ${g.displayOrder}`);
	}
	for (const c of input.components) {
		const found = services.get(c.name);
		if (!found) {
			missing.push(c.name);
			if (automated) missingRules.push(c.name);
			continue;
		}
		if (c.group !== undefined) {
			const parent = found.parentId ? byId.get(found.parentId) : undefined;
			if (parent?.name !== c.group) misplaced.push(`${c.name}: not under group ${c.group}`);
		}
		const want = c.group === undefined ? order.get(`service:${c.name}`) : order.get(`child:${c.group}:${c.name}`);
		if (found.displayOrder !== want) misplaced.push(`${c.name}: order ${found.displayOrder}, expected ${want}`);
		if (
			automated &&
			!ruleOk(
				rules.find((r) => r.name === c.name),
				c.tags,
				found.id
			)
		) {
			missingRules.push(c.name);
		}
	}

	const state: MonitoringStatusPageState = {
		exists: true,
		public: page.isPrivate !== true,
		domainProblems: [],
		missingComponents: missing,
		misplacedComponents: misplaced,
		missingRules,
		extraComponents: components.filter((c) => !declaredNames.has(c.name)).map((c) => c.name),
		extraRules: rules.filter((r) => !input.components.some((c) => c.name === r.name)).map((r) => r.name),
	};
	if (page.customDomain) state.domain = page.customDomain;
	if (input.domain !== undefined) {
		if ((page.customDomain ?? "").toLowerCase() !== input.domain.toLowerCase()) {
			state.domainProblems.push(`serves ${page.customDomain ?? "no custom domain"}, declared ${input.domain}`);
		} else {
			const verification = await api.customDomain.verification(page.id);
			state.domainVerified = isVerified(verification);
			if (!state.domainVerified) {
				const { record } = recordsFor(input.domain, verification);
				if (record) state.domainRecord = record;
				state.domainProblems.push(...(verification.verificationErrors ?? []));
			}
		}
	}
	return state;
}
