import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardView, Idea, IdeaPatch, Person, SchoolHolidaysResponse, Settings, Space } from "../shared/types";
import { api } from "./api";
import { Calendar } from "./components/Calendar";
import { IdeaDialog } from "./components/IdeaDialog";
import { PeopleDialog } from "./components/PeopleDialog";
import { SchoolHolidayPicker } from "./components/SchoolHolidayPicker";
import { SpacesPanel } from "./components/SpacesPanel";
import { YearDialog } from "./components/YearDialog";
import { localToday } from "./format";
import { useIdeaDrag } from "./useIdeaDrag";

function yearFromHash(): number | null {
  const match = /^#(\d{4})$/.exec(window.location.hash);
  return match ? Number(match[1]) : null;
}

function defaultYear(years: number[]): number | null {
  const current = new Date().getFullYear();
  if (years.includes(current)) return current;
  return years.length ? years[years.length - 1] : null;
}

function withIdea(view: BoardView, ideaId: string, patch: IdeaPatch): BoardView {
  return {
    ...view,
    board: {
      ...view.board,
      spaces: view.board.spaces.map((space) => ({
        ...space,
        ideas: space.ideas.map((idea) => (idea.id === ideaId ? { ...idea, ...patch } : idea)),
      })),
    },
  };
}

export function App() {
  const [years, setYears] = useState<number[] | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [view, setView] = useState<BoardView | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [openIdea, setOpenIdea] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [yearDialog, setYearDialog] = useState(false);
  const [today, setToday] = useState(localToday);
  const [settings, setSettings] = useState<Settings>({ schoolHolidayStates: [] });
  const [holidays, setHolidays] = useState<SchoolHolidaysResponse>({ holidays: [], incomplete: false });
  const scroller = useRef<HTMLDivElement>(null);
  const yearRef = useRef(year);
  yearRef.current = year;
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [nextYears, nextPeople, nextSettings] = await Promise.all([api.years(), api.people(), api.settings()]);
      let target = yearRef.current;
      if (target === null || !nextYears.includes(target)) {
        const fromHash = yearFromHash();
        target = fromHash !== null && nextYears.includes(fromHash) ? fromHash : defaultYear(nextYears);
      }
      const nextView = target === null ? null : await api.board(target);
      if (id !== requestId.current) return;
      setYears(nextYears);
      setPeople(nextPeople);
      setSettings(nextSettings);
      setYear(target);
      setView(nextView);
    } catch (err) {
      if (id === requestId.current) setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const source = new EventSource("/api/events");
    source.addEventListener("hello", () => {
      setLive(true);
      refresh();
    });
    source.addEventListener("change", () => refresh());
    source.onerror = () => setLive(false);
    const tick = setInterval(() => setToday(localToday()), 60_000);
    return () => {
      source.close();
      clearInterval(tick);
    };
  }, [refresh]);

  const holidayStates = settings.schoolHolidayStates.join(",");
  useEffect(() => {
    if (year === null || !holidayStates) {
      setHolidays({ holidays: [], incomplete: false });
      return;
    }
    let current = true;
    api
      .schoolHolidays(year)
      .then((result) => current && setHolidays(result))
      .catch(() => current && setHolidays({ holidays: [], incomplete: true }));
    return () => {
      current = false;
    };
  }, [year, holidayStates]);

  useEffect(() => {
    if (year !== null && window.location.hash !== `#${year}`) {
      history.replaceState(null, "", `#${year}`);
    }
  }, [year]);

  useEffect(() => {
    const onHash = () => {
      const fromHash = yearFromHash();
      if (fromHash !== null && fromHash !== yearRef.current && years?.includes(fromHash)) selectYear(fromHash);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const selectYear = (next: number) => {
    yearRef.current = next;
    setYear(next);
    setOpenIdea(null);
    refresh();
  };

  /** Runs a mutation and reloads; errors are shown in the banner. Resolves to whether it succeeded. */
  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      try {
        await action();
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const patchIdea = useCallback(
    (ideaId: string, patch: IdeaPatch) => {
      if (yearRef.current === null) return;
      const target = yearRef.current;
      requestId.current++;
      setView((v) => (v ? withIdea(v, ideaId, patch) : v));
      run(() => api.updateIdea(target, ideaId, patch));
    },
    [run],
  );

  const { drag, begin } = useIdeaDrag({
    year: year ?? new Date().getFullYear(),
    scroller,
    onClick: setOpenIdea,
    onDates: (ideaId, start, end) => patchIdea(ideaId, { start, end }),
    onSendBack: (ideaId) => patchIdea(ideaId, { start: null, end: null }),
  });

  const located = useMemo(() => {
    if (!view || !openIdea) return null;
    for (const space of view.board.spaces) {
      const idea = space.ideas.find((i) => i.id === openIdea);
      if (idea) return { idea, space, readOnlyFrom: undefined as number | undefined };
    }
    const carry = view.carryOver.find((c) => c.idea.id === openIdea);
    if (carry) {
      const space: Space = { id: carry.spaceId, name: carry.spaceName, createdAt: "", ideas: [] };
      return { idea: carry.idea, space, readOnlyFrom: carry.year };
    }
    return null;
  }, [view, openIdea]);

  if (years === null) {
    return <div className="loading">{error ?? "Loading…"}</div>;
  }

  const suggestion = years.length ? years[years.length - 1] + 1 : new Date().getFullYear();
  const boardEmpty = view !== null && view.board.spaces.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <h1>Calendiro</h1>
        {years.length > 0 && year !== null && (
          <div className="year-switcher">
            <button onClick={() => selectYear(years[years.indexOf(year) - 1])} disabled={years.indexOf(year) <= 0} aria-label="Previous year">
              ‹
            </button>
            <select value={year} onChange={(e) => selectYear(Number(e.target.value))} aria-label="Year">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={() => selectYear(years[years.indexOf(year) + 1])}
              disabled={years.indexOf(year) >= years.length - 1}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
        )}
        <button onClick={() => setYearDialog(true)}>Add year</button>
        {boardEmpty && year !== null && (
          <button
            className="danger subtle"
            onClick={() =>
              window.confirm(`Remove the empty ${year} board?`) &&
              run(async () => {
                await api.removeYear(year);
                yearRef.current = null;
              })
            }
          >
            Remove {year}
          </button>
        )}
        <span className="spacer" />
        <SchoolHolidayPicker
          selected={settings.schoolHolidayStates}
          incomplete={holidays.incomplete}
          onChange={(states) => {
            requestId.current++;
            setSettings({ ...settings, schoolHolidayStates: states });
            run(() => api.setSchoolHolidayStates(states));
          }}
        />
        <span className={`live ${live ? "live-on" : ""}`} title={live ? "Changes from others appear automatically" : "Reconnecting…"}>
          {live ? "Live" : "Offline"}
        </span>
        <button onClick={() => setPeopleOpen(true)}>People ({people.length})</button>
      </header>

      {error && (
        <div className="error-banner" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {view && year !== null ? (
        <main className="workspace">
          <SpacesPanel
            board={view.board}
            spaceColors={view.spaceColors}
            people={people}
            drag={drag}
            onAddSpace={(name) => run(() => api.addSpace(year, name))}
            onRenameSpace={(spaceId, name) => run(() => api.renameSpace(year, spaceId, name))}
            onColorSpace={(spaceId, color) => run(() => api.setSpaceColor(year, spaceId, color))}
            onDeleteSpace={(spaceId) => run(() => api.deleteSpace(year, spaceId))}
            onAddIdea={(spaceId, name) => run(() => api.addIdea(year, spaceId, name))}
            onOpenIdea={setOpenIdea}
            onBeginDrag={(e, kind, idea: Idea) => begin(e, kind, idea)}
          />
          <Calendar
            ref={scroller}
            view={view}
            people={people}
            today={today}
            holidays={holidays.holidays}
            drag={drag}
            onBeginDrag={(e, kind, idea) => begin(e, kind, idea)}
            onOpenCarryOver={setOpenIdea}
          />
        </main>
      ) : (
        <main className="empty-state">
          <h2>Plan your year</h2>
          <p className="muted">Add a year to get a board with activity spaces and a calendar.</p>
          <button className="primary" onClick={() => setYearDialog(true)}>
            Add {suggestion}
          </button>
        </main>
      )}

      {drag?.started && drag.kind === "place" && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.label}
        </div>
      )}

      {located && year !== null && (
        <IdeaDialog
          key={located.idea.id}
          year={year}
          idea={located.idea}
          space={located.space}
          people={people}
          readOnlyFrom={located.readOnlyFrom}
          onPatch={(patch) => patchIdea(located.idea.id, patch)}
          onDelete={() => {
            setOpenIdea(null);
            run(() => api.deleteIdea(year, located.idea.id));
          }}
          onClose={() => setOpenIdea(null)}
          onOpenYear={(y) => selectYear(y)}
        />
      )}

      {peopleOpen && (
        <PeopleDialog
          people={people}
          onAdd={(name) => run(() => api.addPerson(name))}
          onRename={(id, name) => run(() => api.renamePerson(id, name))}
          onRotate={(id) => run(() => api.rotateFeed(id))}
          onDelete={(id) => run(() => api.deletePerson(id))}
          onClose={() => setPeopleOpen(false)}
        />
      )}

      {yearDialog && (
        <YearDialog
          suggestion={suggestion}
          existing={years}
          onAdd={(y) => {
            setYearDialog(false);
            run(async () => {
              await api.addYear(y);
              yearRef.current = y;
              setYear(y);
            });
          }}
          onClose={() => setYearDialog(false)}
        />
      )}
    </div>
  );
}
