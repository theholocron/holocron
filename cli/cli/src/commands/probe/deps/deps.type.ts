import type { Catalogs } from "@theholocron/pkg-utils";

/** A dependency section of a manifest. */
export type DependencySection = "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";

/** One manifest entry that is not a `workspace:` link. */
export interface DependencyEdge {
	name: string;
	/** The spec as written in the manifest (`catalog:`, `catalog:cli`, `^1.2.3`). */
	spec: string;
	section: DependencySection;
	/** The using package's name, or `(root)`. */
	pkg: string;
	/** The using package's folder relative to the repo root (`""` for the root). */
	dir: string;
	/** The group (top-level folder) of the using package, or `root`. */
	group: string;
	/** The manifest path relative to the repo root. */
	file: string;
}

/** One dependency: the catalog it belongs in (`null` for peer-only) and everything that uses it. */
export interface DependencyRow {
	name: string;
	catalog: string | null;
	range: string | null | undefined;
	groups: string[];
	edges: DependencyEdge[];
}

/** What the workspace looks like against the catalog rule. */
export interface DependencyPlan {
	root: string;
	dirs: string[];
	catalogs: Catalogs;
	wanted: Record<string, Record<string, string | undefined>>;
	rows: DependencyRow[];
	flags: string[];
}

/** The result of choosing one range out of several. */
export interface PickedRange {
	range: string;
	majorConflict: boolean;
	unparsed?: boolean;
}

/** A package that uses a dependency, with how (`prod`, `dev`, `peer`). */
export interface DependencyUser {
	pkg: string;
	kinds: string[];
}
