export interface LatestRegistry {
	/** The registry-doc version loaded, for the check's summary. */
	version: string;
	/** Every registered package name (`LinkEntry.package`), e.g. `@theholocron/cli`. */
	packages: Set<string>;
}

export interface LoadLatestRegistryInput {
	/** Injectable for tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

export interface Packument {
	version: string;
	dist: { tarball: string; integrity: string };
}

export interface RegistryModule {
	getRegistry: () => Record<string, { package: string }>;
}
