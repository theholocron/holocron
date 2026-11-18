import type { RestClient } from "../utils.js";

/** How a component is shown: a `SERVICE` is one thing that is up or down, a `GROUP` holds services. */
export type StatusComponentType = "SERVICE" | "GROUP";

/**
 * The impact an automation rule puts on a component while its check fails, in Checkly's order of severity:
 * `MAJOR_OUTAGE` is the full outage.
 */
export type StatusRuleImpact = "UNDER_MAINTENANCE" | "DEGRADED_PERFORMANCE" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE";

/** The fields of a v3 status page a write carries (Checkly's `PublicStatusPageV3Mutation`). `name` and `url` are required. */
export interface StatusPageInput {
	/** The page's title. */
	name: string;
	/** The page's address segment on Checkly (`<url>.checkly-status-page.com`). */
	url: string;
	/** Text under the title. */
	description?: string | null;
	/** A hostname of your own, e.g. `status.example.com`; its DNS record comes from {@link CustomDomainVerification}. */
	customDomain?: string | null;
	/** A URL of an image shown at the top of the page. */
	logo?: string | null;
	/** A URL of the image shown instead of `logo` in the dark theme. */
	logoDark?: string | null;
	/** A URL the page's logo links to. */
	redirectTo?: string | null;
	/** A URL of an image used as the page's favicon. */
	favicon?: string | null;
	/** The theme the page opens in (`LIGHT`, `DARK` or `AUTO`). */
	defaultTheme?: string;
	/** A link to the privacy policy shown in the footer. */
	privacyPolicyLink?: string | null;
	/** A link to the terms of service shown in the footer. */
	termsOfServiceLink?: string | null;
	/** A link to where people get help, shown on the page. */
	supportLink?: string | null;
	/** Text shown in the page's footer. */
	footerText?: string | null;
	/** A Google Analytics tag the page loads. */
	googleAnalyticsTag?: string | null;
	/** Whether search engines may index the page. */
	allowIndexing?: boolean;
	/** A private page needs a sign-in to read. */
	isPrivate?: boolean;
	/** Colours of the light and dark themes. */
	themeColors?: Record<string, unknown>;
}

/** A v3 status page as Checkly returns it. */
export interface StatusPage extends StatusPageInput {
	/** The page's id, which every other endpoint takes. */
	id: string;
	/** The Checkly account that owns the page. */
	accountId: string;
	/** The status page version; always 3. */
	version: 3;
	/** When Checkly made the page. */
	created_at: string;
	/** When the page was last changed. */
	updated_at?: string | null;
}

/** How a component is drawn. */
export interface StatusComponentConfiguration {
	/** Show the component's history (the uptime bar). */
	showHistoricalData?: boolean;
	/** For a `GROUP`: show it expanded when the page loads. */
	expandedByDefault?: boolean;
}

/** The fields of a component a write carries (`PublicStatusPageV3ComponentMutation`). */
export interface StatusComponentInput {
	/** The component's name, which is what a person reads. */
	name: string;
	/** Where it sits among its siblings, lowest first. */
	displayOrder: number;
	/** A `SERVICE` or a `GROUP`; a new component is a `SERVICE` unless this says otherwise. */
	type?: StatusComponentType;
	/** Text shown under the component's name. */
	description?: string | null;
	/** Whether the page leaves the component out. */
	hidden?: boolean;
	/** The `GROUP` component this one sits under; must be on the same page. */
	parentId?: string | null;
	/** Settings of how the component is drawn. */
	configuration?: StatusComponentConfiguration;
}

/** A component as Checkly returns it. */
export interface StatusComponent extends StatusComponentInput {
	/** The component's id. */
	id: string;
	/** The page the component is on. */
	statusPageId: string;
	/** Whether it is a `SERVICE` or a `GROUP`. */
	type: StatusComponentType;
	/** How the component is drawn: with its history, and for a group whether it starts expanded. */
	configuration: StatusComponentConfiguration;
	/** When Checkly made the component. */
	created_at: string;
	/** When the component was last changed. */
	updated_at?: string | null;
}

/** One component an automation rule acts on, and how badly. */
export interface StatusRuleComponent {
	/** The id of the component the rule acts on. */
	componentId: string;
	/** How badly the component is marked while the rule's incident is open. */
	targetImpact: StatusRuleImpact;
}

/** The fields of an automation rule a write carries (`PublicStatusPageV3AutomationRuleMutation`). */
export interface StatusRuleInput {
	/** The rule's name. */
	name: string;
	/** Body of the update that opens the incident. */
	firstUpdate: string;
	/** Body of the update that resolves it. */
	lastUpdate: string;
	/** A failing check matches when it, or its group, carries any of these tags (at least one). */
	tags: string[];
	/** Whether the rule can open incidents; a disabled rule never does. */
	enabled?: boolean;
	/** Whether the page's subscribers are told when the rule opens or resolves an incident. */
	notifySubscribers?: boolean;
	/** Minutes after an automated incident before this rule may open the next; 0 turns it off. */
	coolDownWindowMinutes?: number;
	/** The components the rule marks, each with its impact. */
	components?: StatusRuleComponent[];
}

/** An automation rule as Checkly returns it. */
export interface StatusRule extends Omit<StatusRuleInput, "components"> {
	/** The rule's id. */
	id: string;
	/** The page the rule is on. */
	statusPageId: string;
	/** The incident the rule has open now, if any. */
	incidentId?: string | null;
	/** The components the rule marks, each with its impact and the id of that link. */
	components: Array<StatusRuleComponent & { id: string }>;
	/** When Checkly made the rule. */
	created_at: string;
	/** When the rule was last changed. */
	updated_at?: string | null;
}

/**
 * What Checkly asks of a custom domain's DNS (`PublicStatusPageV3CustomDomainVerification`). `ownershipVerification` is
 * the record to make (`txt` or `cname`), `CNAME` the host the domain points at. The response carries no word about
 * proxying: that is left to the caller.
 */
export interface CustomDomainVerification {
	/** Where the domain's ownership check stands (`active` once verified). */
	status: string;
	/** Where the domain's certificate stands (`active` once issued). */
	sslStatus: string;
	/** How ownership is proven: a `txt` record or an `http` file. */
	validationMethod?: "txt" | "http";
	/** Why the last check failed, when it did. */
	verificationErrors?: string[];
	/** The record that proves ownership: its type, host name and value. */
	ownershipVerification?: {
		/** The kind of record that proves ownership. */
		type: "txt" | "cname";
		/** The host name to make it at. */
		name: string;
		/** What the record holds or points at. */
		value: string;
	};
	/** The TXT records that validate the certificate. */
	validationRecords?: Array<{ status: string; txt_name: string; txt_value: string }>;
	/** Why the certificate could not be issued, when it could not. */
	sslValidationErrors?: Array<{ message?: string }>;
	/** The host the domain's CNAME points at. */
	CNAME?: string;
}

interface Page<T> {
	length: number;
	entries: T[];
	nextId?: string | null;
}

const LIMIT = 100;
const MAX_PAGES = 50;

async function readAll<T>(rest: RestClient, path: string): Promise<T[]> {
	const found: T[] = [];
	let nextId: string | null | undefined;
	for (let n = 0; n < MAX_PAGES; n++) {
		const page = await rest.request<Page<T>>(path, {
			query: { limit: String(LIMIT), ...(nextId ? { nextId } : {}) },
		});
		found.push(...page.entries);
		if (!page.nextId) return found;
		nextId = page.nextId;
	}
	throw new Error(`Checkly returned more than ${MAX_PAGES * LIMIT} entries from ${path}; refusing to read them all`);
}

/**
 * The v3 status page endpoints: pages, their components, the automation rules that tie check tags to components, and the
 * custom domain verification. `rest` must be bound to the `/v3` base URL (`createChecklyClient` does that).
 */
export function statusPages(rest: RestClient) {
	return {
		/** Every status page on the account. */
		list: (): Promise<StatusPage[]> => readAll<StatusPage>(rest, "/status-pages"),
		/** One status page. */
		get: (id: string): Promise<StatusPage> => rest.request<StatusPage>(`/status-pages/${id}`),
		/** Makes a status page. */
		create: (input: StatusPageInput): Promise<StatusPage> =>
			rest.request<StatusPage>("/status-pages", { method: "POST", body: input }),
		/** Replaces a status page: the fields not sent take their defaults, so send the whole thing. */
		update: (id: string, input: StatusPageInput): Promise<StatusPage> =>
			rest.request<StatusPage>(`/status-pages/${id}`, { method: "PUT", body: input }),
		components: {
			list: (pageId: string): Promise<StatusComponent[]> =>
				readAll<StatusComponent>(rest, `/status-pages/${pageId}/components`),
			create: (pageId: string, input: StatusComponentInput): Promise<StatusComponent> =>
				rest.request<StatusComponent>(`/status-pages/${pageId}/components`, { method: "POST", body: input }),
			update: (pageId: string, id: string, input: StatusComponentInput): Promise<StatusComponent> =>
				rest.request<StatusComponent>(`/status-pages/${pageId}/components/${id}`, {
					method: "PUT",
					body: input,
				}),
		},
		rules: {
			list: (pageId: string): Promise<StatusRule[]> =>
				readAll<StatusRule>(rest, `/status-pages/${pageId}/automation-rules`),
			create: (pageId: string, input: StatusRuleInput): Promise<StatusRule> =>
				rest.request<StatusRule>(`/status-pages/${pageId}/automation-rules`, { method: "POST", body: input }),
			update: (pageId: string, id: string, input: StatusRuleInput): Promise<StatusRule> =>
				rest.request<StatusRule>(`/status-pages/${pageId}/automation-rules/${id}`, {
					method: "PUT",
					body: input,
				}),
		},
		customDomain: {
			/** The DNS record Checkly asks for and whether it has been found. */
			verification: (pageId: string): Promise<CustomDomainVerification> =>
				rest.request<CustomDomainVerification>(`/status-pages/${pageId}/custom-domain-verifications`),
			/** Asks Checkly to look for the record again. */
			recheck: (pageId: string): Promise<CustomDomainVerification> =>
				rest.request<CustomDomainVerification>(`/status-pages/${pageId}/custom-domain-verifications/recheck`, {
					method: "POST",
				}),
		},
	};
}
