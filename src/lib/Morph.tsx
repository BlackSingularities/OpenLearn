import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

/**
 * Zdanie jako lista słów z kluczami. Słowa o tym samym kluczu w dwóch wersjach zdania
 * płynnie przesuwają się na nowe miejsce (layout animation), nowe słowa wlatują, usunięte znikają.
 */
export interface MorphTok {
  /** Stabilny klucz – ten sam w obu wersjach zdania dla „tego samego” słowa. */
  k: string;
  w: string;
  role?: string;
}

/** Zapis skrócony: „k:słowo@rola”, np. "cls:the classroom@obj". Bez „k:” kluczem jest samo słowo. */
export function toks(s: string): MorphTok[] {
  return s.split(' | ').map((part) => {
    const [main, role] = part.split('@');
    const idx = main.indexOf(':');
    return idx > 0 ? { k: main.slice(0, idx), w: main.slice(idx + 1), role } : { k: main.toLowerCase(), w: main, role };
  });
}

export function MorphSentence({ tokens, colors, id = 'm' }: { tokens: MorphTok[]; colors: Record<string, string>; id?: string }) {
  return (
    <LayoutGroup id={id}>
      <motion.div layout className="morph">
        <AnimatePresence mode="popLayout" initial={false}>
          {tokens.map((t) => (
            <motion.span
              key={t.k}
              layout
              className={`morph-tok ${t.role ? 'has-role' : ''}`}
              style={{ '--rc': t.role ? colors[t.role] : 'transparent' } as React.CSSProperties}
              initial={{ opacity: 0, y: -22, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 22, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              {t.w}
            </motion.span>
          ))}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}

export function RoleLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="role-legend">
      {items.map((i) => (
        <span key={i.label} style={{ '--rc': i.color } as React.CSSProperties}>
          {i.label}
        </span>
      ))}
    </div>
  );
}
