import { useState } from "react";
import type { Board, Idea, Person, Space, SpaceColor } from "../../shared/types";
import { FALLBACK_COLOR, formatRange, initials } from "../format";
import type { DragKind, DragState } from "../useIdeaDrag";
import { ColorPicker } from "./ColorPicker";
import { InlineEdit } from "./InlineEdit";

function byName(a: { name: string; createdAt: string }, b: { name: string; createdAt: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.createdAt.localeCompare(b.createdAt);
}

interface Props {
  board: Board;
  spaceColors: Record<string, SpaceColor>;
  people: Person[];
  drag: DragState | null;
  onAddSpace: (name: string) => void;
  onRenameSpace: (spaceId: string, name: string) => void;
  onColorSpace: (spaceId: string, color: string | null) => void;
  onDeleteSpace: (spaceId: string) => void;
  onAddIdea: (spaceId: string, name: string) => void;
  onOpenIdea: (ideaId: string) => void;
  onBeginDrag: (e: React.PointerEvent, kind: DragKind, idea: Idea) => void;
}

export function SpacesPanel({ board, spaceColors, people, drag, onAddSpace, onRenameSpace, onColorSpace, onDeleteSpace, onAddIdea, onOpenIdea, onBeginDrag }: Props) {
  const [newSpace, setNewSpace] = useState("");
  const sendingBack = drag?.started && drag.kind !== "place";
  const spaces = [...board.spaces].sort(byName);

  return (
    <aside className={`spaces${sendingBack && drag?.overPanel ? " spaces-drop" : ""}`} data-drop-panel="">
      {sendingBack && <div className="spaces-drop-hint">Drop here to send the idea back to its space</div>}
      <div className="spaces-scroll">
        {board.spaces.length === 0 && (
          <p className="muted spaces-empty">
            No activity spaces in {board.year} yet. Create one, for example “Biking tours”, and collect ideas in it.
          </p>
        )}
        {spaces.map((space) => (
          <SpaceCard
            key={space.id}
            space={space}
            color={spaceColors[space.id] ?? { color: FALLBACK_COLOR, custom: false }}
            people={people}
            draggingId={drag?.started ? drag.ideaId : null}
            onRename={(name) => onRenameSpace(space.id, name)}
            onColor={(color) => onColorSpace(space.id, color)}
            onDelete={() => onDeleteSpace(space.id)}
            onAddIdea={(name) => onAddIdea(space.id, name)}
            onOpenIdea={onOpenIdea}
            onBeginDrag={onBeginDrag}
          />
        ))}
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newSpace.trim()) return;
            onAddSpace(newSpace.trim());
            setNewSpace("");
          }}
        >
          <input value={newSpace} onChange={(e) => setNewSpace(e.target.value)} placeholder="New activity space…" />
          <button type="submit" disabled={!newSpace.trim()}>
            Add space
          </button>
        </form>
      </div>
    </aside>
  );
}

interface SpaceCardProps {
  space: Space;
  color: SpaceColor;
  people: Person[];
  draggingId: string | null;
  onRename: (name: string) => void;
  onColor: (color: string | null) => void;
  onDelete: () => void;
  onAddIdea: (name: string) => void;
  onOpenIdea: (ideaId: string) => void;
  onBeginDrag: (e: React.PointerEvent, kind: DragKind, idea: Idea) => void;
}

function SpaceCard({ space, color, people, draggingId, onRename, onColor, onDelete, onAddIdea, onOpenIdea, onBeginDrag }: SpaceCardProps) {
  const [newIdea, setNewIdea] = useState("");
  const names = new Map(people.map((p) => [p.id, p.name]));
  const empty = space.ideas.length === 0;

  return (
    <section className="space" style={{ ["--space-color" as string]: color.color }}>
      <header className="space-header">
        <ColorPicker color={color.color} custom={color.custom} onChange={onColor} />
        <InlineEdit className="space-name" value={space.name} onSave={onRename} label="Rename space" />
        <button
          className="icon-button"
          onClick={onDelete}
          disabled={!empty}
          title={empty ? "Delete this empty space" : "Only an empty space can be deleted"}
          aria-label="Delete space"
        >
          ×
        </button>
      </header>
      <ul className="ideas">
        {[...space.ideas].sort(byName).map((idea) => {
          const scheduled = Boolean(idea.start && idea.end);
          const classes = ["idea"];
          if (scheduled) classes.push("idea-scheduled");
          if (draggingId === idea.id) classes.push("idea-dragging");
          return (
            <li
              key={idea.id}
              className={classes.join(" ")}
              title={scheduled ? "Already on the calendar. Drag its bar back here to unschedule it." : "Drag onto a day of the calendar"}
              onPointerDown={(e) => (scheduled ? undefined : onBeginDrag(e, "place", idea))}
              onClick={() => scheduled && onOpenIdea(idea.id)}
            >
              <div className="idea-main">
                <span className="idea-name">{idea.name}</span>
                {scheduled && <span className="idea-dates">{formatRange(idea.start!, idea.end!)}</span>}
              </div>
              {idea.note && <div className="idea-note">{idea.note}</div>}
              {idea.participants.length > 0 && (
                <div className="chips">
                  {idea.participants.map((id) => (
                    <span key={id} className="chip" title={names.get(id)}>
                      {initials(names.get(id) ?? "?")}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="add-row add-idea"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newIdea.trim()) return;
          onAddIdea(newIdea.trim());
          setNewIdea("");
        }}
      >
        <input value={newIdea} onChange={(e) => setNewIdea(e.target.value)} placeholder="New idea…" />
        <button type="submit" disabled={!newIdea.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}
