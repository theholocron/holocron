import type { RestClient } from "../utils.js";

/** A view key of a private dashboard. `rawKey` is a credential: the full value, which a person types to read it. */
export interface DashboardKey {
	/** The key's id. */
	id: string;
	/** The full key value. A secret: never log or print it. */
	rawKey: string;
	/** The key with most of it hidden, safe to show. */
	maskedKey: string;
	/** When Checkly made the key. */
	created_at: string;
	/** When the key was last changed. */
	updated_at?: string;
}

/** The settings a dashboard is made or changed with. On an update a field left out is not sent. */
export interface DashboardInput {
	/** The text at the top of the dashboard. Dashboards have no name: this is what they are found by. Required to create. */
	header?: string;
	/** Text under the header. */
	description?: string;
	/** Checks carrying any of these tags are shown (all of them with `useTagsAndOperator`). */
	tags?: string[];
	/** Show only checks carrying every tag instead of any. */
	useTagsAndOperator?: boolean;
	/** Whether the dashboard needs a key to be read. */
	isPrivate?: boolean;
	/** A custom domain such as `status.example.com`; needs a DNS record Checkly verifies. */
	customDomain?: string;
	/** A subdomain of `checklyhq.com`, unique across all users. */
	customUrl?: string;
	/** A URL of an image shown at the top of the dashboard. */
	logo?: string;
	/** A URL of an image used as the dashboard's favicon. */
	favicon?: string;
	/** Where a click on the logo goes. */
	link?: string;
	/** Use the whole screen (`FULL`) or a centred column (`960PX`). */
	width?: "FULL" | "960PX";
	/** Seconds between refreshes of the page. */
	refreshRate?: number;
	/** Whether the checks are shown a page at a time. */
	paginate?: boolean;
	/** Seconds between pages when `paginate` is on. */
	paginationRate?: number;
	/** Show failing checks first. */
	sortByStatus?: boolean;
	/** How many checks one page shows. */
	checksPerPage?: number;
	/** Hide the tags of each check. */
	hideTags?: boolean;
	/** Show incidents on the dashboard. */
	enableIncidents?: boolean;
	/** Show each check expanded. */
	expandChecks?: boolean;
	/** Show the header and the description. */
	showHeader?: boolean;
	/** Show a link to each check run. */
	showCheckRunLinks?: boolean;
	/** Show the name of each check group. */
	showGroupNames?: boolean;
	/** Show the 95th percentile response time. */
	showP95?: boolean;
	/** Show the 99th percentile response time. */
	showP99?: boolean;
	/** CSS applied to the dashboard. */
	customCSS?: string;
}

/** A dashboard as Checkly returns it. */
export interface Dashboard extends DashboardInput {
	/** The id the single-dashboard endpoints take. */
	dashboardId: string;
	/** A number Checkly also returns; the endpoints are keyed by `dashboardId`. */
	id: number;
	/** The view keys of a private dashboard, with their values. Credentials. */
	keys?: DashboardKey[];
	/** When Checkly made the dashboard. */
	created_at: string;
}

const PAGE = 100;
/** A ceiling so a misbehaving API cannot make the read loop forever. */
const MAX_PAGES = 50;

/** Dashboards, which show the checks whose tags match their own. */
export function dashboards(rest: RestClient) {
	return {
		/** Every dashboard on the account, read page by page. */
		list: async (): Promise<Dashboard[]> => {
			const all: Dashboard[] = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				const batch = await rest.request<Dashboard[]>("/dashboards", {
					query: { limit: String(PAGE), page: String(page) },
				});
				all.push(...batch);
				if (batch.length < PAGE) return all;
			}
			throw new Error(`more than ${MAX_PAGES * PAGE} dashboards; refusing to read them all`);
		},

		/** One dashboard by its `dashboardId`. Throws ProviderApiError 404 if there is none. */
		get: (dashboardId: string): Promise<Dashboard> =>
			rest.request<Dashboard>(`/dashboards/${encodeURIComponent(dashboardId)}`),

		/** Make a dashboard. `header` is required. */
		create: (input: DashboardInput & { header: string }): Promise<Dashboard> =>
			rest.request<Dashboard>("/dashboards", { method: "POST", body: { ...input } }),

		/**
		 * Change a dashboard. Checkly's update schema has no required field, so only what is passed is sent; read the
		 * dashboard back to see what it holds.
		 */
		update: (dashboardId: string, input: DashboardInput): Promise<Dashboard> =>
			rest.request<Dashboard>(`/dashboards/${encodeURIComponent(dashboardId)}`, {
				method: "PUT",
				body: { ...input },
			}),
	};
}
