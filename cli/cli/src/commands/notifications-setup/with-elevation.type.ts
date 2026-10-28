import type { Notifications } from "../../plugin/index.js";

export interface ElevationDeps {
	/** The step this is for, as the run names it. */
	label: string;
	notifications: Notifications;
	/** Waits for a person to press Enter. Absent when nobody is there to answer. */
	pause?: (message: string) => Promise<void>;
	print: (line: string) => void;
}
