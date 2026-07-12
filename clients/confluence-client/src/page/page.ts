// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import appConf from "@ce/app-config";
import { exreq, setBaseURL } from "@ce/utils-fetch";

const getPage = (id: string, options = {}) =>
	exreq({
		operation: id,
		method: "get",
		options: {
			...options,
			baseURL: setBaseURL("atlassian", appConf, options?.environment),
		},
	});

const updatePage = (id: string, data: Record<string, unknown>, options = {}) =>
	exreq({
		operation: id,
		method: "put",
		data,
		options: {
			...options,
			baseURL: setBaseURL("atlassian", appConf, options?.environment),
		},
	});

export default {
	get: getPage,
	update: updatePage,
};
