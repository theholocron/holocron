import type { DiscordMessage } from "../discord/discord.js";

/** A delivery the source recognises but cannot read (the service may have changed its payload). The relay answers 422. */
export class MalformedDelivery extends Error {}

/** A service whose webhooks the relay carries into Discord. */
export interface Source {
	/** The first segment of the path the service posts to (`/sentry`), and the prefix of its two bindings. */
	id: string;
	/** Whether the request really came from the service. `raw` is the body exactly as received. */
	verify(headers: Headers, raw: string, secret: string): Promise<boolean>;
	/** The message for one delivery, or null for something this source does not carry (it is acknowledged and dropped).
	 * Throws `MalformedDelivery` for one it should carry but cannot read. */
	format(headers: Headers, payload: unknown): DiscordMessage | null;
}
