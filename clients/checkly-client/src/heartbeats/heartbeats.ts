import type { RestClient } from "../utils.js";

/** A unit of time Checkly takes a heartbeat's period and grace in. */
export type HeartbeatUnit = "seconds" | "minutes" | "hours" | "days";

/** The `heartbeat` block of a heartbeat check: how often it expects a ping, and how late one may be. */
export interface HeartbeatSettings {
	/** Interval expected between pings. */
	period: number;
	/** The unit of `period`. */
	periodUnit: HeartbeatUnit;
	/** Grace added to the period before the check fails. */
	grace: number;
	/** The unit of `grace`. */
	graceUnit: HeartbeatUnit;
	/** UUID token the ping URL is built from. Left out, Checkly makes one. */
	pingToken?: string | null;
}

/** What to send to Checkly to create or update a heartbeat check. */
export interface HeartbeatInput {
	/** The check's display name. */
	name: string;
	/** Whether the check is running. */
	activated?: boolean;
	/** Tags attached to the check. */
	tags?: string[];
	/** The period, grace and ping token. */
	heartbeat: HeartbeatSettings;
}

/** A heartbeat check as Checkly returns it. */
export interface Heartbeat {
	/** Checkly's id for the check. */
	id: string;
	/** The check's display name. */
	name: string;
	/** The kind of check; always `"HEARTBEAT"` here. */
	checkType: "HEARTBEAT";
	/** Whether the check is running. */
	activated: boolean;
	/** Tags attached to the check. */
	tags: string[];
	/** The period, grace, and the ping the job calls. `pingUrl` is a credential: never print or log it. */
	heartbeat: HeartbeatSettings & { pingUrl?: string };
	/** When the check was created, as an ISO timestamp. */
	created_at: string;
	/** When the check was last updated, as an ISO timestamp, or `null`. */
	updated_at: string | null;
}

/** Options for listing heartbeats. */
export interface ListHeartbeatsParams {
	/** Case-insensitive partial match on the name. */
	search?: string;
	/** Checks per page of the underlying list. */
	limit?: number;
	/** The page to fetch. */
	page?: number;
}

/** A row of Checkly's list of every kind of check: only the heartbeats carry this `checkType`. */
interface ListedCheck {
	checkType?: string;
}

/** How many checks of any kind one page of Checkly's list holds when {@link heartbeats}'s `listAll` asks for it. */
const PAGE = 100;

export function heartbeats(rest: RestClient) {
	const page = (params: ListHeartbeatsParams) =>
		rest.request<(ListedCheck & Partial<Heartbeat>)[]>("/checks", {
			query: {
				...(params.search ? { search: params.search } : {}),
				...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
				...(params.page !== undefined ? { page: String(params.page) } : {}),
			},
		});
	const only = (all: (ListedCheck & Partial<Heartbeat>)[]) =>
		all.filter((c): c is Heartbeat => c.checkType === "HEARTBEAT");
	return {
		/**
		 * List the account's heartbeats. Checkly's `/checks` lists every kind of check, heartbeats included, so this reads
		 * a page of it and keeps the ones whose `checkType` is `HEARTBEAT`. A page holds up to `limit` checks of every kind.
		 */
		list: async (params: ListHeartbeatsParams = {}): Promise<Heartbeat[]> => only(await page(params)),

		/** Every heartbeat on the account, reading the list a page at a time until a page comes back short. */
		listAll: async (): Promise<Heartbeat[]> => {
			const found: Heartbeat[] = [];
			for (let n = 1; ; n++) {
				const batch = await page({ limit: PAGE, page: n });
				found.push(...only(batch));
				if (batch.length < PAGE) return found;
			}
		},

		/** Create a heartbeat. The response carries the ping URL. */
		create: (input: HeartbeatInput): Promise<Heartbeat> =>
			rest.request<Heartbeat>("/checks/heartbeat", { method: "POST", body: input }),

		/** Update a heartbeat. The response carries the ping URL. */
		update: (id: string, input: HeartbeatInput): Promise<Heartbeat> =>
			rest.request<Heartbeat>(`/checks/heartbeat/${id}`, { method: "PUT", body: input }),
	};
}
