/**
 * A `validate` function for an `input` positional or option (`PositionalPrompt.validate`) that accepts only
 * digits; anything else returns the message `"enter a number"`.
 */
export const numeric = (value: string): boolean | string => (/^\d+$/.test(value) ? true : "enter a number");
