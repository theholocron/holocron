import { spawn } from "node:child_process";
import { type Return } from "@/types";

const asyncSpawn = (cmd: string, args: string[], options: object = {}): Promise<void> =>
	new Promise((resolve, reject) => {
		const process = spawn(cmd, args, options);

		process.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`process exited with code ${code}`));
			} else {
				resolve();
			}
		});
	});

export async function spwn(cmd: string, args: string[], options: object = {}): Promise<Return<boolean>> {
	const start = performance.now();

	try {
		await asyncSpawn(cmd, args, options);
		return [null, true, performance.now() - start];
	} catch (error) {
		return [error as Error, false, performance.now() - start];
	}
}
