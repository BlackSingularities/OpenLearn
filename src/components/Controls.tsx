import type { Control, Params, ParamValue } from '../lib/types';
import { formatNumber } from '../lib/useAnimationClock';
import { SPEED_CONTROL_MPS, SPEED_LABEL, SPEED_PER_KMH, useSpeedUnit } from './ui';

interface Props {
  controls: Control[];
  values: Params;
  onChange: (key: string, value: ParamValue) => void;
}

function decimalsFor(c: Extract<Control, { type: 'slider' }>): number {
  if (c.decimals !== undefined) return c.decimals;
  const step = c.step ?? 1;
  if (step >= 1) return 0;
  return Math.min(3, Math.ceil(-Math.log10(step)));
}

export function Controls({ controls, values, onChange }: Props) {
  const speedUnit = useSpeedUnit();
  if (controls.length === 0) return null;
  return (
    <div className="controls">
      {controls.map((c) => {
        if (c.type === 'slider') {
          const v = Number(values[c.key] ?? c.default);
          // prędkość (km/h, m/s, km/s): wyświetlana w jednostce z ustawień, a scena dostaje wartość w swojej jednostce
          const mps = c.unit ? SPEED_CONTROL_MPS[c.unit] : undefined;
          const f = mps !== undefined ? mps * 3.6 * SPEED_PER_KMH[speedUnit] : 1;
          const unit = mps !== undefined ? SPEED_LABEL[speedUnit] : c.unit;
          // miejsca po przecinku: tyle, ile potrzeba, żeby krok suwaka był widoczny w nowej jednostce
          const stepShown = (c.step ?? 1) * f;
          const dec = mps === undefined ? decimalsFor(c) : stepShown >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(stepShown)));
          return (
            <label key={c.key} className="control control-slider">
              <span className="control-head">
                <span>{c.label}</span>
                <output>
                  {formatNumber(v * f, dec)}
                  {unit ? ` ${unit}` : ''}
                </output>
              </span>
              <input
                type="range"
                style={{ '--p': `${((v - c.min) / (c.max - c.min || 1)) * 100}%` } as React.CSSProperties}
                min={c.min}
                max={c.max}
                step={c.step ?? 1}
                value={v}
                onChange={(e) => onChange(c.key, Number(e.target.value))}
              />
            </label>
          );
        }
        if (c.type === 'button') {
          const v = Boolean(values[c.key] ?? c.default);
          return (
            <button key={c.key} type="button" className={`control-button ${v ? 'on' : ''}`} aria-pressed={v} onClick={() => onChange(c.key, !v)}>
              {v ? c.labelOn : c.label}
            </button>
          );
        }
        if (c.type === 'toggle') {
          const v = Boolean(values[c.key] ?? c.default);
          return (
            <label key={c.key} className="control control-toggle">
              <span>{c.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={v}
                className={`switch ${v ? 'on' : ''}`}
                onClick={() => onChange(c.key, !v)}
              >
                <span className="knob" />
              </button>
            </label>
          );
        }
        const v = String(values[c.key] ?? c.default);
        return (
          <div key={c.key} className="control control-select">
            <span>{c.label}</span>
            <div className="segmented" role="radiogroup" aria-label={c.label}>
              {c.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={v === o.value}
                  className={v === o.value ? 'active' : ''}
                  onClick={() => onChange(c.key, o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
