import type { Notifications } from "../../plugin/index.js";
import { pickProvider } from "../notifications-channel-add/index.js";

/** The provider that can create a server and hand it over. */
export function pickServerCreator(providers: Notifications[], wanted?: string): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) =>
			typeof p.createServer === "function" &&
			typeof p.inviteLink === "function" &&
			typeof p.hasMember === "function" &&
			typeof p.transferServer === "function",
		{ infinitive: "create a server", gerund: "creating a server" }
	);
}
