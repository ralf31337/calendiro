import { daysInMonth, maxDate, minDate, parseISO, toISO } from "../shared/dates";
import type { Idea, ISODate } from "../shared/types";

export interface Column {
  year: number;
  /** 1-based. */
  month: number;
  first: ISODate;
  last: ISODate;
}

/** Twelve months of the board year plus January of the next year. */
export function boardColumns(year: number): Column[] {
  const columns: Column[] = [];
  for (let i = 0; i < 13; i++) {
    const y = year + Math.floor(i / 12);
    const month = (i % 12) + 1;
    columns.push({ year: y, month, first: toISO(y, month, 1), last: toISO(y, month, daysInMonth(y, month)) });
  }
  return columns;
}

export interface CalendarItem {
  idea: Idea;
  start: ISODate;
  end: ISODate;
  spaceId: string;
  spaceName: string;
  /** Ideas of the previous year's board that reach into this January. */
  readOnly: boolean;
  fromYear: number;
}

export interface Segment {
  item: CalendarItem;
  /** 1-based day numbers within the column's month. */
  fromDay: number;
  toDay: number;
  isFirst: boolean;
  isLast: boolean;
  lane: number;
  /** Lanes of the group of overlapping segments this one belongs to; its width is 1/laneCount. */
  laneCount: number;
}

/**
 * The parts of the items that fall into a month. Segments that overlap, directly or through a chain,
 * form a group; within a group they sit in side-by-side lanes that share the column width equally.
 */
export function segmentsForColumn(column: Column, items: CalendarItem[]): Segment[] {
  const segments: Segment[] = [];
  for (const item of items) {
    if (item.end < column.first || item.start > column.last) continue;
    const from = maxDate(item.start, column.first);
    const to = minDate(item.end, column.last);
    segments.push({
      item,
      fromDay: parseISO(from).day,
      toDay: parseISO(to).day,
      isFirst: from === item.start,
      isLast: to === item.end,
      lane: 0,
      laneCount: 1,
    });
  }
  segments.sort(
    (a, b) => a.fromDay - b.fromDay || b.toDay - a.toDay || a.item.idea.id.localeCompare(b.item.idea.id),
  );

  let group: Segment[] = [];
  let laneEnds: number[] = [];
  let groupEnd = 0;
  const closeGroup = () => {
    for (const segment of group) segment.laneCount = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const segment of segments) {
    if (group.length && segment.fromDay > groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end < segment.fromDay);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.toDay;
    segment.lane = lane;
    groupEnd = group.length ? Math.max(groupEnd, segment.toDay) : segment.toDay;
    group.push(segment);
  }
  closeGroup();
  return segments;
}
