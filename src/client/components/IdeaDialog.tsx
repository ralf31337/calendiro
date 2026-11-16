import { useEffect, useState } from "react";
import { boardBounds, maxDate, validateRange } from "../../shared/dates";
import type { Idea, IdeaPatch, Person, Space } from "../../shared/types";
import { formatRange } from "../format";
import { Modal } from "./Modal";

interface Props {
  year: number;
  idea: Idea;
  space: Space;
  people: Person[];
  readOnlyFrom?: number;
  onPatch: (patch: IdeaPatch) => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenYear?: (year: number) => void;
}

/** Keeps a local draft while the field is being edited, and follows remote changes otherwise. */
function useDraft(value: string): [string, (v: string) => void, (focused: boolean) => void] {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  return [draft, setDraft, setFocused];
}

export function IdeaDialog({ year, idea, space, people, readOnlyFrom, onPatch, onDelete, onClose, onOpenYear }: Props) {
  const readOnly = readOnlyFrom !== undefined;
  const [name, setName, setNameFocus] = useDraft(idea.name);
  const [note, setNote, setNoteFocus] = useDraft(idea.note);
  const [dateError, setDateError] = useState<string | null>(null);
  const scheduled = Boolean(idea.start && idea.end);
  const { firstStart, lastStart, lastEnd } = boardBounds(year);

  const saveName = () => {
    setNameFocus(false);
    const next = name.trim();
    if (next && next !== idea.name) onPatch({ name: next });
    else setName(idea.name);
  };
  const saveNote = () => {
    setNoteFocus(false);
    if (note !== idea.note) onPatch({ note });
  };
  const [startDraft, setStartDraft] = useState(idea.start ?? "");
  const [endDraft, setEndDraft] = useState(idea.end ?? "");
  useEffect(() => {
    setStartDraft(idea.start ?? "");
    setEndDraft(idea.end ?? "");
    setDateError(null);
  }, [idea.start, idea.end]);
  const changeDates = (start: string, end: string) => {
    setStartDraft(start);
    setEndDraft(end);
    if (!start || !end) return;
    const problem = validateRange(year, start, end);
    setDateError(problem);
    if (!problem && (start !== idea.start || end !== idea.end)) onPatch({ start, end });
  };
  const toggle = (personId: string, checked: boolean) => {
    const next = checked ? [...idea.participants, personId] : idea.participants.filter((p) => p !== personId);
    onPatch({ participants: next });
  };

  return (
    <Modal
      title={readOnly ? idea.name : "Idea"}
      onClose={onClose}
      footer={
        readOnly ? (
          <button onClick={() => onOpenYear?.(readOnlyFrom!)}>Open the {readOnlyFrom} board</button>
        ) : (
          <>
            <button
              className="danger"
              onClick={() => window.confirm(`Delete “${idea.name}”?`) && onDelete()}
            >
              Delete idea
            </button>
            <span className="spacer" />
            {scheduled && <button onClick={() => onPatch({ start: null, end: null })}>Send back to space</button>}
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </>
        )
      }
    >
      <p className="muted">
        In <b>{space.name}</b> on the {readOnlyFrom ?? year} board
        {readOnly && ". It reaches into January and can only be changed on its own board."}
      </p>

      {readOnly ? (
        <>
          <p>{formatRange(idea.start!, idea.end!)}</p>
          {idea.note && <p className="note-text">{idea.note}</p>}
          <p className="muted">
            With:{" "}
            {idea.participants.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "nobody"}
          </p>
        </>
      ) : (
        <>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              onFocus={() => setNameFocus(true)}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea
              rows={3}
              value={note}
              placeholder="Optional. Shown as the description in the calendar feed."
              onFocus={() => setNoteFocus(true)}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
            />
          </label>

          <div className="field">
            <span>Dates</span>
            {scheduled ? (
              <div className="date-row">
                <input
                  type="date"
                  value={startDraft}
                  min={firstStart}
                  max={lastStart}
                  onChange={(e) =>
                    changeDates(e.target.value, e.target.value ? maxDate(e.target.value, endDraft) : endDraft)
                  }
                />
                <span>to</span>
                <input
                  type="date"
                  value={endDraft}
                  min={startDraft}
                  max={lastEnd}
                  onChange={(e) => changeDates(startDraft, e.target.value)}
                />
              </div>
            ) : (
              <p className="muted">Not on the calendar. Drag the idea from its space onto a day.</p>
            )}
            {dateError && <p className="error-text">{dateError}</p>}
          </div>

          <div className="field">
            <span>Participants</span>
            {people.length === 0 ? (
              <p className="muted">Add people first (top right).</p>
            ) : (
              <div className="checks">
                {people.map((person) => (
                  <label key={person.id} className="check">
                    <input
                      type="checkbox"
                      checked={idea.participants.includes(person.id)}
                      onChange={(e) => toggle(person.id, e.target.checked)}
                    />
                    {person.name}
                  </label>
                ))}
              </div>
            )}
            <p className="muted small">
              {scheduled
                ? "Ticked people get this idea in their calendar feed."
                : "Ticked people get this idea in their calendar feed once it is on the calendar."}
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}
