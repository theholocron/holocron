/** The part of a GitHub App manifest that is the same for every instance of an App: what it may do and hear about. */
export interface AppManifestBase {
	/** The App's description. */
	description?: string;
	/** The App's homepage. */
	url?: string;
	/** Whether anyone can install it. Defaults to `false`. */
	public?: boolean;
	/** Permission name to `read`, `write` or `admin`. */
	default_permissions: Record<string, string>;
	/** Webhook events the App subscribes to. */
	default_events: string[];
}

/** A GitHub App manifest as the manifest flow takes it. */
export interface AppManifest extends AppManifestBase {
	/** The App's name, unique across all of GitHub. */
	name: string;
	/** Where GitHub sends the browser, with the one-time code, after the App is created. */
	redirect_url: string;
	/** The webhook GitHub delivers events to. */
	hook_attributes: {
		/** The `https` URL events are delivered to. */
		url: string;
		/** Whether GitHub delivers events; always on for a new App. */
		active: true;
	};
}

/** What differs per instance of the App, with the shared part read from a file. */
export interface BuildAppManifestInput {
	/** The parsed manifest file: `default_permissions`, `default_events` and optionally `description`, `url`, `public`. */
	base: unknown;
	/** The App's name. */
	name: string;
	/** The `https` URL GitHub delivers webhooks to. */
	webhookUrl: string;
	/** Where GitHub sends the browser after the App is created. */
	redirectUrl: string;
}
