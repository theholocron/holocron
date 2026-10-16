export interface ResolverDeps {
	readFile: (path: string) => string;
	fileExists: (path: string) => boolean;
}
