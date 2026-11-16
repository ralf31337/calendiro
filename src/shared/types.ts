/** Calendar date without time, formatted `YYYY-MM-DD`. */
export type ISODate = string;

export interface Person {
  id: string;
  name: string;
  /** Secret, rotatable token used in the ICS feed URL. */
  feedId: string;
  createdAt: string;
}

export interface Idea {
  id: string;
  name: string;
  note: string;
  /** Both null while the idea is unscheduled in its space. */
  start: ISODate | null;
  end: ISODate | null;
  /** Person ids. */
  participants: string[];
  createdAt: string;
  updatedAt: string;
  /** Incremented on every change, used as ICS SEQUENCE. */
  sequence: number;
}

export interface Space {
  id: string;
  name: string;
  createdAt: string;
  ideas: Idea[];
}

export interface Board {
  year: number;
  spaces: Space[];
}

/** An idea of the previous year's board whose end reaches into this board's January. */
export interface CarryOver {
  year: number;
  spaceId: string;
  spaceName: string;
  idea: Idea;
}

export interface SpaceColor {
  /** CSS color. */
  color: string;
  /** True when a user picked it, false when it was assigned automatically. */
  custom: boolean;
}

export interface BoardView {
  board: Board;
  carryOver: CarryOver[];
  /** Per space id, for the board's spaces and the carry-over spaces. Same name, same color. */
  spaceColors: Record<string, SpaceColor>;
}

export interface Settings {
  /** Codes of the German states whose school holidays are marked on the calendar. */
  schoolHolidayStates: string[];
}

export interface SchoolHoliday {
  state: string;
  name: string;
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
}

export interface SchoolHolidaysResponse {
  holidays: SchoolHoliday[];
  /** True when some states or years could not be loaded. */
  incomplete: boolean;
}

export interface IdeaPatch {
  name?: string;
  note?: string;
  participants?: string[];
  start?: ISODate | null;
  end?: ISODate | null;
}
