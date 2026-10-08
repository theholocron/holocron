import { spawn } from "node:child_process";

/** Platform-appropriate command to open a path in the OS's file browser. */
function openCommand(path: string): { cmd: string; args: string[] } {
	if (process.platform === "darwin") return { cmd: "open", args: [path] };
	if (process.platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", path] };
	return { cmd: "xdg-open", args: [path] };
}

/**
 * Open `path` in the OS's default file browser (Finder / Explorer /
 * whatever `xdg-open` resolves to on Linux). Fire-and-forget — detached so
 * it outlives this process, and never throws when the opener binary isn't
 * on PATH (e.g. no `xdg-open` in a minimal container).
 */
export function openPath(path: string): void {
	const { cmd, args } = openCommand(path);
	const child = spawn(cmd, args, { stdio: "ignore", detached: true });
	child.on("error", () => {});
	child.unref();
}
