import { GERMAN_STATES } from "../../shared/states";
import { usePopover } from "../usePopover";

interface Props {
  selected: string[];
  incomplete: boolean;
  onChange: (states: string[]) => void;
}

/** Drop-down in the top bar to pick the states whose school holidays are marked on the calendar. */
export function SchoolHolidayPicker({ selected, incomplete, onChange }: Props) {
  const { open, setOpen, root } = usePopover<HTMLDivElement>();
  const summary = selected.length === 0 ? "none" : selected.length <= 3 ? selected.join(", ") : `${selected.length} states`;

  const toggle = (code: string, checked: boolean) =>
    onChange(checked ? [...selected, code] : selected.filter((c) => c !== code));

  return (
    <div className="holiday-picker" ref={root}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} title="School holidays (Schulferien)">
        <span className="holiday-swatch" /> School holidays: {summary} ▾
      </button>
      {open && (
        <div className="holiday-popover" role="dialog" aria-label="School holidays">
          <p className="muted small">Mark the school holidays of these states on the calendar.</p>
          <div className="holiday-states">
            {GERMAN_STATES.map((state) => (
              <label key={state.code} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(state.code)}
                  onChange={(e) => toggle(state.code, e.target.checked)}
                />
                {state.name}
              </label>
            ))}
          </div>
          <div className="holiday-footer">
            {incomplete ? (
              <span className="error-text">Some holidays could not be loaded.</span>
            ) : (
              <span className="muted small">
                Data: <a href="https://schulferien-api.de" target="_blank" rel="noreferrer">schulferien-api.de</a>
              </span>
            )}
            <button onClick={() => onChange([])} disabled={selected.length === 0}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
