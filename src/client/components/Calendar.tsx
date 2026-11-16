import { forwardRef, useMemo } from "react";
import { addDays, daysInMonth, maxDate, minDate, toISO, weekday } from "../../shared/dates";
import type { BoardView, Idea, Person, SchoolHoliday } from "../../shared/types";
import { boardColumns, segmentsForColumn, type CalendarItem } from "../layout";
import { FALLBACK_COLOR, formatRange } from "../format";
import type { DragKind, DragState } from "../useIdeaDrag";

const ROW = 22;
const DAY_LABEL = 44;
const BAR_AREA = 168;
const COLUMN_WIDTH = DAY_LABEL + BAR_AREA + 4;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface Props {
  view: BoardView;
  people: Person[];
  today: string;
  holidays: SchoolHoliday[];
  drag: DragState | null;
  onBeginDrag: (e: React.PointerEvent, kind: DragKind, idea: Idea) => void;
  onOpenCarryOver: (ideaId: string) => void;
}

export const Calendar = forwardRef<HTMLDivElement, Props>(function Calendar(
  { view, people, today, holidays, drag, onBeginDrag, onOpenCarryOver },
  ref,
) {
  const year = view.board.year;
  const columns = useMemo(() => boardColumns(year), [year]);

  /** Holiday names per visible day, e.g. "Osterferien (NI)". */
  const holidayDays = useMemo(() => {
    const first = columns[0].first;
    const last = columns[columns.length - 1].last;
    const days = new Map<string, string[]>();
    for (const holiday of holidays) {
      for (let date = maxDate(holiday.start, first); date <= minDate(holiday.end, last); date = addDays(date, 1)) {
        const label = `${holiday.name} (${holiday.state})`;
        const list = days.get(date) ?? [];
        if (!list.includes(label)) list.push(label);
        days.set(date, list);
      }
    }
    return days;
  }, [holidays, columns]);

  const items = useMemo(() => {
    const list: CalendarItem[] = [];
    for (const c of view.carryOver) {
      if (c.idea.start && c.idea.end) {
        list.push({
          idea: c.idea, start: c.idea.start, end: c.idea.end,
          spaceId: c.spaceId, spaceName: c.spaceName, readOnly: true, fromYear: c.year,
        });
      }
    }
    for (const space of view.board.spaces) {
      for (const idea of space.ideas) {
        const preview = drag?.started && drag.ideaId === idea.id ? drag : null;
        if (preview?.overPanel) continue;
        const dates = preview?.preview ?? (idea.start && idea.end ? { start: idea.start, end: idea.end } : null);
        if (!dates) continue;
        list.push({ idea, ...dates, spaceId: space.id, spaceName: space.name, readOnly: false, fromYear: year });
      }
    }
    return list;
  }, [view, drag, year]);

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  return (
    <div className="calendar" ref={ref}>
      <div className="calendar-columns">
        {columns.map((column, index) => {
          const days = daysInMonth(column.year, column.month);
          const segments = segmentsForColumn(column, items);
          const nextYear = index === 12;
          return (
            <section key={column.first} className={`month${nextYear ? " month-next" : ""}`} style={{ width: COLUMN_WIDTH }}>
              <header className="month-header">
                <span>{MONTHS[column.month - 1]}</span>
                {nextYear && <small>{column.year}</small>}
              </header>
              <div className="month-days" style={{ height: days * ROW }}>
                {Array.from({ length: days }, (_, i) => {
                  const date = toISO(column.year, column.month, i + 1);
                  const wd = weekday(date);
                  const classes = ["day"];
                  if (wd === 0 || wd === 6) classes.push("weekend");
                  if (wd === 1) classes.push("monday");
                  if (date === today) classes.push("today");
                  const holiday = holidayDays.get(date);
                  return (
                    <div key={date} className={classes.join(" ")} data-date={date} style={{ height: ROW }}>
                      <span
                        className={`day-label${holiday ? " holiday" : ""}`}
                        style={{ width: DAY_LABEL }}
                        title={holiday?.join("\n")}
                      >
                        <b>{i + 1}</b> {WEEKDAYS[wd]}
                      </span>
                    </div>
                  );
                })}
                {segments.map((segment) => {
                  const laneW = BAR_AREA / segment.laneCount;
                  return (
                    <Bar
                      key={`${segment.item.idea.id}-${column.first}`}
                      item={segment.item}
                      top={(segment.fromDay - 1) * ROW}
                      height={(segment.toDay - segment.fromDay + 1) * ROW}
                      left={DAY_LABEL + segment.lane * laneW + 2}
                      width={laneW - 3}
                      color={view.spaceColors[segment.item.spaceId]?.color ?? FALLBACK_COLOR}
                      isFirst={segment.isFirst}
                      isLast={segment.isLast}
                      names={names}
                      active={drag?.started === true && drag.ideaId === segment.item.idea.id}
                      onBeginDrag={onBeginDrag}
                      onOpenCarryOver={onOpenCarryOver}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
});

interface BarProps {
  item: CalendarItem;
  top: number;
  height: number;
  left: number;
  width: number;
  color: string;
  isFirst: boolean;
  isLast: boolean;
  names: Map<string, string>;
  active: boolean;
  onBeginDrag: (e: React.PointerEvent, kind: DragKind, idea: Idea) => void;
  onOpenCarryOver: (ideaId: string) => void;
}

function Bar({ item, top, height, left, width, color, isFirst, isLast, names, active, onBeginDrag, onOpenCarryOver }: BarProps) {
  const { idea } = item;
  const participants = idea.participants.map((id) => names.get(id)).filter(Boolean);
  const title = [
    idea.name,
    formatRange(item.start, item.end),
    participants.length ? `With: ${participants.join(", ")}` : "Nobody ticked yet",
    item.readOnly ? `Belongs to the ${item.fromYear} board` : "",
    idea.note,
  ]
    .filter(Boolean)
    .join("\n");
  const classes = ["bar"];
  if (width < 50) classes.push("bar-vertical");
  if (!isFirst) classes.push("bar-continued-top");
  if (!isLast) classes.push("bar-continued-bottom");
  if (item.readOnly) classes.push("bar-readonly");
  if (participants.length === 0) classes.push("bar-unassigned");
  if (active) classes.push("bar-active");

  return (
    <div
      className={classes.join(" ")}
      style={{ top, height, left, width, ["--bar-color" as string]: color }}
      title={title}
      onPointerDown={(e) => (item.readOnly ? undefined : onBeginDrag(e, "move", idea))}
      onClick={() => item.readOnly && onOpenCarryOver(idea.id)}
    >
      {!item.readOnly && isFirst && (
        <div className="bar-handle bar-handle-start" onPointerDown={(e) => onBeginDrag(e, "start", idea)} />
      )}
      <span className="bar-label">{idea.name}</span>
      {!item.readOnly && isLast && (
        <div className="bar-handle bar-handle-end" onPointerDown={(e) => onBeginDrag(e, "end", idea)} />
      )}
    </div>
  );
}
