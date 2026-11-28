/** A commit status a coverage provider reports on a pull request (names only), as `Coverage.statusContexts()` returns it. */
export interface StatusContext {
	/** The context GitHub shows, such as `codecov/patch`. */
	name: string;
	/** Whether the `ci` aggregate (and a ruleset) must see it reach `success`. */
	required: boolean;
}
