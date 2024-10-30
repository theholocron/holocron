export type Choice<Value> = {
	description?: string;
	disabled?: boolean | string;
	checked?: boolean;
	name?: string;
	type?: never;
	value: Value;
};
