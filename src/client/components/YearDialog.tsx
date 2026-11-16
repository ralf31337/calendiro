import { useState } from "react";
import { Modal } from "./Modal";

interface Props {
  suggestion: number;
  existing: number[];
  onAdd: (year: number) => void;
  onClose: () => void;
}

export function YearDialog({ suggestion, existing, onAdd, onClose }: Props) {
  const [value, setValue] = useState(String(suggestion));
  const year = Number(value);
  const valid = /^\d{4}$/.test(value) && !existing.includes(year);

  return (
    <Modal title="Add a year" onClose={onClose}>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onAdd(year);
        }}
      >
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <button type="submit" className="primary" disabled={!valid}>
          Add {valid ? year : "year"}
        </button>
      </form>
      {existing.includes(year) && <p className="muted">That year already has a board.</p>}
      <p className="muted small">A new year starts with an empty board.</p>
    </Modal>
  );
}
