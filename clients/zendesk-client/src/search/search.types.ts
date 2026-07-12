import type { IAPIResponse } from "../types.js";
import type { IGroup } from "../group/group.types.js";
import type { ITicket } from "../tickets/tickets.types.js";
import type { IUser } from "../user/user.types.js";

export interface ISearchResponse extends IAPIResponse {
  facets?: string | null;
  results: ITicket[] | IUser[] | IGroup[];
}
