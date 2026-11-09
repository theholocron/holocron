/** What npm's `alpha` dist-tag points at for one package. */
export interface AlphaRelease {
	version: string;
	/** The peer ranges that release declares; absent when it has none. */
	peerDependencies?: Record<string, string>;
}

/** Looks up a package's `alpha` release; `undefined` when npm has no such package or tag. Throws when npm cannot be asked. */
export type AlphaReleaseLookup = (name: string) => AlphaRelease | undefined;
