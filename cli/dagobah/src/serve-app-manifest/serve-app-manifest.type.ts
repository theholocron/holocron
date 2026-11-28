/** What the local server needs: the nonce GitHub must echo back, and how to draw the page once the port is known. */
export interface ServeAppManifestInput {
	/** The `state` GitHub must send back with the code. */
	state: string;
	/** The page for `/`, given the redirect URL on this server. */
	page: (redirectUrl: string) => string;
	/** How long to wait for GitHub's redirect, in milliseconds. Defaults to five minutes. */
	timeoutMs?: number | undefined;
}

/** A running one-shot server. */
export interface AppManifestServer {
	/** The address to open in the browser. */
	url: string;
	/** Resolves with the one-time code GitHub sends back; rejects on timeout. */
	code: Promise<string>;
	/** Stops the server. Safe to call twice. */
	close: () => void;
}
