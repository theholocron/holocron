export const str = {
	toArray: (str: string | string[]): string[] => (Array.isArray(str) ? str : [str]),
	toBoolean: (val: string | undefined) => val === "true",
};
