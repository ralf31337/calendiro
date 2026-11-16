import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onSave: (value: string) => void;
  label: string;
  className?: string;
}

/** Text that turns into an input on click; saves on Enter or blur, Escape reverts. */
export function InlineEdit({ value, onSave, label, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (!editing) {
    return (
      <button className={`inline-edit ${className ?? ""}`} onClick={() => setEditing(true)} title={label}>
        {value}
      </button>
    );
  }
  return (
    <input
      ref={input}
      className={`inline-edit-input ${className ?? ""}`}
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
