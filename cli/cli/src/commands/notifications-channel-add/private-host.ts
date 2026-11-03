/**
 * Whether a URL host is one an avatar redirect must never lead to: a name that means this machine or a private
 * network, or an IP literal in a loopback, private, link-local (cloud metadata is `169.254.169.254`), carrier-grade NAT
 * or unspecified range. Only literals and well-known names can be judged here; a public name that resolves to a private
 * address is not caught, since the check runs before the lookup.
 */
export function isPrivateHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
		return true;
	}
	if (host.includes(":")) return isPrivateIpv6(host);
	return isPrivateIpv4(host);
}

function isPrivateIpv4(host: string): boolean {
	const parts = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
	if (!parts) return false;
	const [a, b] = [Number(parts[1]), Number(parts[2])];
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	);
}

function isPrivateIpv6(host: string): boolean {
	if (host === "::" || host === "::1") return true;
	// An IPv4 address written inside IPv6 (the URL parser turns `::ffff:127.0.0.1` into `::ffff:7f00:1`).
	const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
	if (mapped) {
		const hi = parseInt(mapped[1]!, 16);
		const lo = parseInt(mapped[2]!, 16);
		return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
	}
	const first = parseInt(host.split(":")[0]!, 16);
	// fc00::/7 unique local, fe80::/10 link-local.
	return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}
