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
