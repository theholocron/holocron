import axios from "axios";

export const createToken = (user: string, password: string): string =>
	Buffer.from(`${user}/token:${password}`).toString("base64");

export function setToken(user: string, password: string): void {
	const encoded = createToken(user, password);
	axios.defaults.headers.common.Authorization = `Basic ${encoded}`;
}
