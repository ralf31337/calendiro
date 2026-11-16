import { useState } from "react";
import type { Person } from "../../shared/types";
import { feedUrl } from "../api";
import { InlineEdit } from "./InlineEdit";
import { Modal } from "./Modal";

interface Props {
  people: Person[];
  onAdd: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => void;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function PeopleDialog({ people, onAdd, onRename, onRotate, onDelete, onClose }: Props) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (person: Person) => {
    await navigator.clipboard.writeText(feedUrl(person));
    setCopied(person.id);
    setTimeout(() => setCopied((c) => (c === person.id ? null : c)), 1500);
  };

  return (
    <Modal title="People" onClose={onClose}>
      <p className="muted">
        Each person has a private calendar feed. Subscribe to it in Outlook or Google Calendar. Anyone who knows
        the link can read it; rotate the link to lock out old copies.
      </p>
      <ul className="people">
        {people.map((person) => (
          <li key={person.id} className="person">
            <div className="person-head">
              <InlineEdit className="person-name" value={person.name} onSave={(n) => onRename(person.id, n)} label="Rename" />
              <span className="spacer" />
              <button
                onClick={() =>
                  window.confirm(`Create a new feed link for ${person.name}? The old link stops working immediately.`) &&
                  onRotate(person.id)
                }
              >
                New link
              </button>
              <button
                className="danger"
                onClick={() =>
                  window.confirm(`Delete ${person.name}? Their ticks and their calendar feed are removed.`) &&
                  onDelete(person.id)
                }
              >
                Delete
              </button>
            </div>
            <div className="feed-row">
              <input readOnly value={feedUrl(person)} onFocus={(e) => e.target.select()} aria-label="Feed URL" />
              <button onClick={() => copy(person)}>{copied === person.id ? "Copied" : "Copy"}</button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="add-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await onAdd(name.trim())) setName("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
        <button type="submit" className="primary" disabled={!name.trim()}>
          Add person
        </button>
      </form>
    </Modal>
  );
}
