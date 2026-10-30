/** Sections whose versions come from a catalog. Peers keep their own compatibility ranges. */
export const CATALOG_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

/** Catalogs that are not a group's own dependencies. */
export const SPECIAL_CATALOGS = ["peers"] as const;

/** The scope of this org's own packages. */
export const SCOPE = "@theholocron/";
