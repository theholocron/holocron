import { session } from "./session.ts";

export type { StorageLogger, TSessionStorage } from "./session.ts";

/** Browser storage helpers. */
export const storage = {
	/** Namespaced session storage; create a store with `create`. */
	session,
};
