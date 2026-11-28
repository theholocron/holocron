/** The part of a destination that identifies it. */
interface DestinationIdentity {
	name: string;
	url: string;
}

/** What a source wants its destination to be. */
interface WantedDestination {
	name: string;
	url: string;
}

/** The origin of a URL, or `undefined` when it is not one. */
function originOf(url: string): string | undefined {
	try {
		return new URL(url).origin;
	} catch {
		return undefined;
	}
}

/**
 * Whether a Cloudflare notification destination belongs to a relay source. The URL equal to the wanted one always
 * matches. Cloudflare otherwise returns a destination's URL masked, the whole path replaced (`https://host/...`), so
 * the path cannot be compared: a masked URL matches when it is exactly that shape on the wanted URL's origin and the
 * name is equal (ignoring case). A real URL that merely ends in `...` is not a masked one.
 */
export function destinationMatches(destination: DestinationIdentity, wanted: WantedDestination): boolean {
	if (destination.url === wanted.url) return true;
	if (destination.name.toLowerCase() !== wanted.name.toLowerCase()) return false;
	const origin = originOf(wanted.url);
	return origin !== undefined && destination.url === `${origin}/...`;
}
