import { spawn } from "node:child_process";

/**
 * Runs `cloudflared tunnel run` in the foreground and resolves with its exit status. The tunnel's token goes to the
 * connector through `TUNNEL_TOKEN` in its environment, never its arguments: `ps` shows a process's arguments to every
 * user on the machine and not its environment. Ctrl-C and a termination signal are passed on, so the connector shuts
 * down cleanly before this returns.
 */
export function runCloudflared(token: string, spawnImpl: typeof spawn = spawn): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawnImpl("cloudflared", ["tunnel", "--no-autoupdate", "run"], {
			stdio: "inherit",
			env: { ...process.env, TUNNEL_TOKEN: token },
		});
		const handlers = (["SIGINT", "SIGTERM"] as const).map((signal) => {
			const handler = () => void child.kill(signal);
			process.on(signal, handler);
			return [signal, handler] as const;
		});
		const done = () => {
			for (const [signal, handler] of handlers) process.off(signal, handler);
		};
		child.once("error", (err) => {
			done();
			reject(
				new Error(
					(err as NodeJS.ErrnoException).code === "ENOENT"
						? "cloudflared is not installed: `brew install cloudflared`"
						: `could not start cloudflared: ${err.message}`
				)
			);
		});
		child.once("exit", (code) => {
			done();
			resolve(code ?? 1);
		});
	});
}
