export interface IGroup {
	// The time the group was created
	created_at?: string | null;
	// If the group is the default one for the account
	default?: boolean | null;
	// Deleted groups get marked as such
	deleted?: boolean | null;
	// The description of the group
	description?: string | null;
	// Automatically assigned when creating groups
	id?: number | null;
	// If true, the group is public. If false, the group is private. You can't change a private group to a public group
	is_public?: boolean | null;
	// The name of the group
	name?: string | null;
	// The time of the last update of the group
	updated_at?: string | null;
	// The API url of the group
	url?: string | null;
}
