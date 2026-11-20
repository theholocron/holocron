/** A status `update work --status` may set; `forced` says the board's automation owns it. */
export interface WorkStatusAllowed {
	ok: true;
	/** The board's rules own this status (In Review, Blocked, Done): it was forced and will not last. */
	forced: boolean;
}

/** A status `update work --status` refuses, and why. */
export interface WorkStatusRefused {
	ok: false;
	problem: string;
}

/** Whether `update work --status` may set a status, and what to tell the person. */
export type WorkStatusGuard = WorkStatusAllowed | WorkStatusRefused;
