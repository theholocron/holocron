export { stubFetch } from "@theholocron/http-client/testing";

export const cfOk = (result: unknown, status = 200) => ({
	status,
	body: { success: true, errors: [], result },
});

export const cfFail = (errors: unknown[], status = 400) => ({
	status,
	body: { success: false, errors, result: null },
});
