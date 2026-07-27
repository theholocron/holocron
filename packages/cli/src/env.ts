export interface EnvLookup {
	get(key: string): string | undefined;
	first(...keys: string[]): string | undefined;
}

export function createEnvLookup(source: NodeJS.ProcessEnv = process.env): EnvLookup {
	return {
		get(key: string): string | undefined {
			return source[key] || undefined;
		},
		first(...keys: string[]): string | undefined {
			for (const key of keys) {
				const val = source[key];
				if (val) return val;
			}
			return undefined;
		},
	};
}
