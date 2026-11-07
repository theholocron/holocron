/** What the notifier remembers between runs, so the registry is asked once a day. */
export interface CacheEntry {
	/** The newest version the registry named on this run's channel. */
	latestVersion: string;
	/** When it was asked, in milliseconds since the epoch. */
	checkedAt: number;
}

/** What {@link checkForUpdates} needs to look for a newer version of a package. */
export interface UpdateCheckOptions {
	/** The package on npm to look up, and to name in the notice. */
	name: string;
	/** The version that is running now. A prerelease is compared on its own channel. */
	currentVersion: string;
	/** The directory the answer is kept in, created when it is first written. One per tool. */
	cacheDir: string;
	/** The variables that switch the notice off (`CI`, `NO_UPDATE_NOTIFIER`). Default the process environment. */
	env?: Record<string, string | undefined>;
	/** How the notice tells people to update. Default `npm install -g <name>`. */
	installCommand?: string;
}
