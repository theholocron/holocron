import { createStorage } from "./session";

export type { TSessionStorage } from "./session";
export { isSessionStorageAvailable } from "./session";

export const storage = {
	session: createStorage,
};
