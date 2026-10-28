export const numeric = (value: string): boolean | string => (/^\d+$/.test(value) ? true : "enter a number");
