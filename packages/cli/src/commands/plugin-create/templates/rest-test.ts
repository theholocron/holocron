import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const factoryName = `create${inputs.vendorName}RestClient`;
	return `import { ProviderApiError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { ${factoryName} } from "../rest.js";
import { stubFetch } from "./helpers.js";

describe("${factoryName}", () => {
\tit("sends bearer + accept headers and returns the parsed body", async () => {
\t\tconst stub = stubFetch([{ status: 200, body: { ok: true } }]);
\t\tconst client = ${factoryName}({ token: "t", fetch: stub.fetch });
\t\tconst res = await client.request<{ ok: boolean }>("/me");
\t\texpect(res.ok).toBe(true);
\t\texpect(stub.calls[0]?.headers["authorization"]).toBe("Bearer t");
\t\texpect(stub.calls[0]?.headers["accept"]).toBe("application/json");
\t});

\tit("serializes body as JSON and sets content-type when present", async () => {
\t\tconst stub = stubFetch([{ status: 200, body: {} }]);
\t\tconst client = ${factoryName}({ token: "t", fetch: stub.fetch });
\t\tawait client.request<unknown>("/resource", { method: "POST", body: { name: "demo" } });
\t\texpect(stub.calls[0]?.method).toBe("POST");
\t\texpect(stub.calls[0]?.headers["content-type"]).toBe("application/json");
\t\texpect(stub.calls[0]?.body).toEqual({ name: "demo" });
\t});

\tit("returns undefined on 204", async () => {
\t\tconst stub = stubFetch([{ status: 204 }]);
\t\tconst client = ${factoryName}({ token: "t", fetch: stub.fetch });
\t\texpect(await client.request<unknown>("/whatever")).toBeUndefined();
\t});

\tit("throws ProviderApiError with the HTTP status on non-2xx", async () => {
\t\tconst stub = stubFetch([{ status: 401, body: { messages: ["invalid"] } }]);
\t\tconst client = ${factoryName}({ token: "bad", fetch: stub.fetch });
\t\tconst err = await client.request<unknown>("/me").catch((e: unknown) => e);
\t\texpect(err).toBeInstanceOf(ProviderApiError);
\t\texpect((err as ProviderApiError).status).toBe(401);
\t});

\tit("wraps transport-level failures with status 0", async () => {
\t\tconst throwing: typeof fetch = async () => { throw new TypeError("fetch failed"); };
\t\tconst client = ${factoryName}({ token: "t", fetch: throwing });
\t\tconst err = await client.request<unknown>("/me").catch((e: unknown) => e);
\t\texpect(err).toBeInstanceOf(ProviderApiError);
\t\texpect((err as ProviderApiError).status).toBe(0);
\t});

\tit("trims trailing slashes from the base URL", () => {
\t\tconst client = ${factoryName}({ token: "t", baseUrl: "${inputs.baseUrl}//" });
\t\texpect(client.baseUrl).toBe("${inputs.baseUrl}");
\t});
});
`;
}
