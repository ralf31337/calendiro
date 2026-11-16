import { useEffect, useRef } from "react";
import { usePopover } from "../usePopover";

const PRESETS = [
  "#e5484d", "#f76b15", "#f5a524", "#c7b400", "#46a758", "#12a594",
  "#0d9fd8", "#3e63dd", "#6e56cf", "#ab4aba", "#d6409f", "#8d6e63",
];

interface Props {
  color: string;
  custom: boolean;
  onChange: (color: string | null) => void;
}

/** The space's color dot; clicking it opens presets, a custom color input, and a reset to automatic. */
export function ColorPicker({ color, custom, onChange }: Props) {
  const { open, setOpen, root } = usePopover<HTMLDivElement>();
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(pending.current), []);

  const pickLater = (next: string) => {
    clearTimeout(pending.current);
    pending.current = setTimeout(() => onChange(next), 300);
  };

  const pick = (next: string | null) => {
    clearTimeout(pending.current);
    setOpen(false);
    onChange(next);
  };

  return (
    <div className="color-picker" ref={root}>
      <button
        className="space-dot"
        style={{ background: color }}
        onClick={() => setOpen((o) => !o)}
        title="Change color"
        aria-label="Change color"
        aria-expanded={open}
      />
      {open && (
        <div className="color-popover" role="dialog" aria-label="Space color">
          <div className="color-swatches">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                className={`color-swatch${custom && color === preset ? " color-swatch-selected" : ""}`}
                style={{ background: preset }}
                onClick={() => pick(preset)}
                aria-label={preset}
              />
            ))}
          </div>
          <div className="color-actions">
            <label className="color-custom">
              <input
                type="color"
                value={custom ? color : "#3e63dd"}
                onChange={(e) => pickLater(e.target.value)}
              />
              Custom…
            </label>
            <button onClick={() => pick(null)} disabled={!custom}>
              Automatic
            </button>
          </div>
          <p className="muted small">Applies to spaces with this name in every year.</p>
        </div>
      )}
    </div>
  );
}
