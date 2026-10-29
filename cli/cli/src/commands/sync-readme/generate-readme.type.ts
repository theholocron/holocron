export interface PackageEntry {
	package: string;
	docsUrl: string;
	npmUrl: string;
}

export type PackagesRegistry = Record<string, PackageEntry>;

export interface RepoTemplateConfig {
	description: string;
	homepage: string;
	scripts: Record<string, string>;
	packages?: PackagesRegistry;
	installation?: string;
}

export interface ReadmeSections {
	description: string;
	packages?: string;
	installation?: string;
	development: string;
	releases: string;
}
