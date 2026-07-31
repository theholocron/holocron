export interface SidebarLink {
	label: string;
	slug: string;
}

export interface SidebarGroup {
	label: string;
	items: Array<SidebarLink | SidebarGroup>;
}

export interface DocsConfig {
	slug: string;
	parent: string | null;
	name: string;
	sidebar: Array<SidebarLink | SidebarGroup>;
}

const config: DocsConfig = {
	slug: "utils",
	parent: null,
	name: "Utils",
	sidebar: [
		{ label: "Overview", slug: "utils" },
		{
			label: "Packages",
			items: [
				{ label: "Array", slug: "utils/array-utils" },
				{ label: "Date & Time", slug: "utils/date-time-utils" },
				{ label: "Environment", slug: "utils/env-utils" },
				{ label: "Location", slug: "utils/location-utils" },
				{ label: "Misc", slug: "utils/misc-utils" },
				{ label: "Storage", slug: "utils/storage-utils" },
				{ label: "String", slug: "utils/string-utils" },
				{ label: "URI", slug: "utils/uri-utils" },
			],
		},
	],
};

export default config;
