/**
 * The tag that records the commit a package was last deployed at: `deployed/<name>`, the package name with the scope's `@`
 * dropped and `/` made `-` (`@theholocron/sentinel` is `deployed/theholocron-sentinel`).
 */
export function markerTag(pkgName: string): string {
	return `deployed/${pkgName.replace(/^@/, "").replace(/\//g, "-")}`;
}
