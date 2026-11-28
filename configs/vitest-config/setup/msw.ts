import { afterAll, afterEach, beforeAll } from "vitest";

interface Worker {
	start(options?: { onUnhandledRequest?: string }): Promise<void>;
	resetHandlers(): void;
	stop(): void;
}

interface Server {
	listen(options?: { onUnhandledRequest?: string }): void;
	resetHandlers(): void;
	close(): void;
}

interface Annotations {
	beforeAll?(): Promise<void> | void;
}

/**
 * Registers Vitest hooks that start a Mock Service Worker `worker` before the tests, reset its handlers after each
 * test and stop it afterwards. `annotations.beforeAll` runs first.
 */
export function setupMSWBrowser(worker: Worker, annotations?: Annotations) {
	beforeAll(async () => {
		await annotations?.beforeAll?.();
		await worker.start({ onUnhandledRequest: "warn" });
	});
	afterEach(() => {
		worker.resetHandlers();
	});
	afterAll(() => {
		worker.stop();
	});
}

/**
 * Registers Vitest hooks that start a Mock Service Worker `server` before the tests, reset its handlers after each
 * test and close it afterwards. `annotations.beforeAll` runs first.
 */
export function setupMSWNode(server: Server, annotations?: Annotations) {
	beforeAll(async () => {
		await annotations?.beforeAll?.();
		server.listen({ onUnhandledRequest: "warn" });
	});
	afterEach(() => {
		server.resetHandlers();
	});
	afterAll(() => {
		server.close();
	});
}
