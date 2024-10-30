export const toArray = (str: string | string[]): string[] => (Array.isArray(str)) ? str : [str];
export const toBoolean = (val: string | undefined) => val === "true";
