import { exec } from "node:child_process";
import { promisify } from "node:util";
import { type Return } from "@/types";

const asyncExec = promisify(exec);

export async function command(cmd: string, options: object = {}): Promise<Return<string>> {
	const start = performance.now();

	try {
		const { stdout } = await asyncExec(cmd, options);
		return [null, stdout, performance.now() - start];
	} catch (error) {
		return [error as Error, null, performance.now() - start];
	}
}

export async function isInstalled(cmd: string, options: object = {}): Promise<boolean> {
	const [err] = await command(`command -v ${cmd}`, options);
	return !err;
}
