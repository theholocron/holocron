function isNotEmpty(val: string): boolean | string {
	if (!val || val.trim().length === 0) {
		return "Cannot be empty";
	}

	return true;
}

export const validate = {
	isNotEmpty,
};
