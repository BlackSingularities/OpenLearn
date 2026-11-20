/** Wyróżnianie fragmentów tekstu w scenach tematów z języka polskiego (i nie tylko). */

/** Słowo z wyróżnionym fragmentem: `wy|róż|nienie` → części, `[x]` oznacza fragment akcentowany kolorem. */
export function Marked({ text, color }: { text: string; color?: string }) {
  const parts = text.split(/(\[[^\]]+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('[') ? (
          <b key={i} className="mk" style={color ? ({ '--mk': color } as React.CSSProperties) : undefined}>
            {p.slice(1, -1)}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
