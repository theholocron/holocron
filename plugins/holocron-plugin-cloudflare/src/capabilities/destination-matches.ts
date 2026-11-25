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

/** The origin of a URL, or `undefined` when it is not one (a masked `https://host/...` still parses). */
function originOf(url: string): string | undefined {
	try {
		return new URL(url).origin;
	} catch {
		return undefined;
	}
}

/**
 * Whether a Cloudflare notification destination belongs to a relay source. Cloudflare returns a destination's URL
 * masked (`https://host/...`, the path replaced), so the exact URL cannot be compared: the name must be equal
 * (ignoring case) and the URL either equal to the wanted one or masked (ends with `...`) with the same origin.
 */
export function destinationMatches(destination: DestinationIdentity, wanted: WantedDestination): boolean {
	if (destination.name.toLowerCase() !== wanted.name.toLowerCase()) return false;
	if (destination.url === wanted.url) return true;
	if (!destination.url.endsWith("...")) return false;
	const origin = originOf(destination.url);
	return origin !== undefined && origin === originOf(wanted.url);
}
