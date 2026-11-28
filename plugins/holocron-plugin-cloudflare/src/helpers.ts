export const cfOk = (result: unknown, status = 200) => ({
	status,
	body: { success: true, errors: [], result },
});
