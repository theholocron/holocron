import { open, unlink } from "node:fs/promises";

/**
 * Takes a lock next to the config so two runs cannot create and hand over different servers and then overwrite
 * each other's `guildId`. Returns a function that releases it, or undefined when another run holds it. The lock
 * is a file made only if absent; one left behind by a crashed run has to be deleted by hand, and the caller says so.
 */
export async function lockConfig(
	filepath: string
): Promise<{ path: string; release: () => Promise<void> } | undefined> {
	const path = `${filepath}.create-server.lock`;
	try {
		const handle = await open(path, "wx");
		await handle.writeFile(`${process.pid}\n`);
		await handle.close();
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EEXIST") return undefined;
		throw err;
	}
	return { path, release: () => unlink(path).catch(() => undefined) };
}
