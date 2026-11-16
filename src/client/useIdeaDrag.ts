import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, boardBounds, diffDays, maxDate, minDate } from "../shared/dates";
import type { ISODate } from "../shared/types";

export type DragKind = "place" | "move" | "start" | "end";

export interface DragState {
  kind: DragKind;
  ideaId: string;
  label: string;
  started: boolean;
  x: number;
  y: number;
  /** Proposed dates while hovering the calendar. */
  preview: { start: ISODate; end: ISODate } | null;
  overPanel: boolean;
}

interface Session extends DragState {
  originX: number;
  originY: number;
  originStart: ISODate | null;
  originEnd: ISODate | null;
  /** Days between the bar start and the day that was grabbed. */
  grabOffset: number;
}

interface Options {
  year: number;
  scroller: React.RefObject<HTMLElement | null>;
  onClick: (ideaId: string) => void;
  onDates: (ideaId: string, start: ISODate, end: ISODate) => void;
  onSendBack: (ideaId: string) => void;
}

const THRESHOLD = 4;
const EDGE = 48;

function hitTest(x: number, y: number): { date?: ISODate; panel?: boolean } {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.dataset.date) return { date: el.dataset.date };
    if (el.dataset.dropPanel !== undefined) return { panel: true };
  }
  return {};
}

function clamp(date: ISODate, lo: ISODate, hi: ISODate): ISODate {
  return maxDate(lo, minDate(date, hi));
}

export function useIdeaDrag({ year, scroller, onClick, onDates, onSendBack }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const session = useRef<Session | null>(null);
  const callbacks = useRef({ onClick, onDates, onSendBack });
  callbacks.current = { onClick, onDates, onSendBack };
  const frame = useRef(0);

  const propose = useCallback(
    (s: Session, date: ISODate): { start: ISODate; end: ISODate } | null => {
      const { firstStart, lastStart, lastEnd } = boardBounds(year);
      switch (s.kind) {
        case "place":
          return date >= firstStart && date <= lastStart ? { start: date, end: date } : null;
        case "move": {
          const length = diffDays(s.originStart!, s.originEnd!);
          const latestStart = minDate(lastStart, addDays(lastEnd, -length));
          const start = clamp(addDays(date, -s.grabOffset), firstStart, latestStart);
          return { start, end: addDays(start, length) };
        }
        case "start":
          return { start: clamp(date, firstStart, minDate(lastStart, s.originEnd!)), end: s.originEnd! };
        case "end":
          return { start: s.originStart!, end: clamp(date, s.originStart!, lastEnd) };
      }
    },
    [year],
  );

  const update = useCallback(
    (x: number, y: number) => {
      const s = session.current;
      if (!s) return;
      s.x = x;
      s.y = y;
      if (!s.started && Math.hypot(x - s.originX, y - s.originY) < THRESHOLD) return;
      s.started = true;
      const hit = hitTest(x, y);
      s.overPanel = Boolean(hit.panel);
      if (hit.date) s.preview = propose(s, hit.date);
      else if (hit.panel) s.preview = null;
      setDrag({ ...s });
    },
    [propose],
  );

  const end = useCallback((commit: boolean) => {
    const s = session.current;
    session.current = null;
    cancelAnimationFrame(frame.current);
    document.body.classList.remove("dragging");
    setDrag(null);
    if (!s || !commit) return;
    if (!s.started) {
      callbacks.current.onClick(s.ideaId);
    } else if (s.overPanel) {
      if (s.kind !== "place") callbacks.current.onSendBack(s.ideaId);
    } else if (s.preview && (s.preview.start !== s.originStart || s.preview.end !== s.originEnd)) {
      callbacks.current.onDates(s.ideaId, s.preview.start, s.preview.end);
    }
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => update(e.clientX, e.clientY);
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && end(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [update, end]);

  const autoScroll = useCallback(() => {
    const s = session.current;
    const el = scroller.current;
    if (!s || !el) return;
    if (s.started) {
      const rect = el.getBoundingClientRect();
      const inside = s.x >= rect.left && s.x <= rect.right && s.y >= rect.top && s.y <= rect.bottom;
      if (inside) {
        const speed = (distance: number) => (distance < EDGE ? Math.ceil((EDGE - distance) / 4) : 0);
        const dx = speed(rect.right - s.x) - speed(s.x - rect.left);
        const dy = speed(rect.bottom - s.y) - speed(s.y - rect.top);
        if (dx || dy) {
          el.scrollBy(dx, dy);
          update(s.x, s.y);
        }
      }
    }
    frame.current = requestAnimationFrame(autoScroll);
  }, [scroller, update]);

  const begin = useCallback(
    (
      e: React.PointerEvent,
      kind: DragKind,
      idea: { id: string; name: string; start: ISODate | null; end: ISODate | null },
    ) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      let grabOffset = 0;
      if (kind === "move" && idea.start) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit.date) grabOffset = diffDays(idea.start, hit.date);
      }
      session.current = {
        kind,
        ideaId: idea.id,
        label: idea.name,
        started: false,
        x: e.clientX,
        y: e.clientY,
        originX: e.clientX,
        originY: e.clientY,
        originStart: idea.start,
        originEnd: idea.end,
        grabOffset,
        preview: idea.start && idea.end ? { start: idea.start, end: idea.end } : null,
        overPanel: false,
      };
      document.body.classList.add("dragging");
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(autoScroll);
    },
    [autoScroll],
  );

  return { drag, begin };
}
