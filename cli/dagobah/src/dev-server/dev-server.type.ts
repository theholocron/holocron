/** What {@link startDevServer} needs: the handler to call, the environment to give it, and where to listen. */
export interface DevServerInput<E> {
	/** The handler a request is passed to, with `env`. Sentinel's is `handleWebhookRequest`. */
	handle: (request: Request, env: E) => Promise<Response>;
	/** The environment handed to the handler on every request. */
	env: E;
	/** The port to listen on. `0` picks a free one. */
	port: number;
	/** The only path the handler is served on; any other is a 404. Defaults to `/api/webhook`, the path Vercel serves. */
	path?: string | undefined;
	/** One line per request: the method, the path and the status. Never a header or a body. Defaults to nothing. */
	log?: ((line: string) => void) | undefined;
}

/** A running development server. */
export interface DevServer {
	/** The address the handler is served on, e.g. `http://127.0.0.1:3000/api/webhook`. */
	url: string;
	/** Stops the server, ending any open connection. */
	close: () => Promise<void>;
}
