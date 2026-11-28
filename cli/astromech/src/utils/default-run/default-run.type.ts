export interface SpawnResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

export type Run = (command: string, args: string[], options: Record<string, unknown>) => SpawnResult;
