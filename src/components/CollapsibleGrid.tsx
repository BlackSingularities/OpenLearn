import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Siatka kafelków zwinięta do dwóch wierszy. Koniec drugiego wiersza zanika do przezroczystości,
 * a przycisk „pokaż więcej” rozwija resztę. Gdy wierszy jest najwyżej dwa – nic nie zwija.
 */
export function CollapsibleGrid({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [full, setFull] = useState<number>(0);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => setOpen(false), [resetKey]);

  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const measure = () => {
      const items = Array.from(ul.children) as HTMLElement[];
      const top = (el: HTMLElement) => el.offsetTop - ul.offsetTop;
      const tops = [...new Set(items.map(top))].sort((a, b) => a - b);
      setFull(ul.scrollHeight + 8);
      if (tops.length <= 2) return setLimit(null);
      // dół drugiego wiersza = najniższy dół kafelków w tym wierszu
      const second = items.filter((el) => top(el) === tops[1]);
      setLimit(Math.max(...second.map((el) => top(el) + el.offsetHeight)) + 8);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    Array.from(ul.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [children]);

  const collapsed = limit !== null && !open;
  return (
    <div className={`grid-wrap${collapsed ? ' is-collapsed' : ''}`}>
      <div className="grid-clip" style={limit !== null ? { maxHeight: collapsed ? limit : full } : undefined}>
        <ul className="grid" ref={ref}>
          {children}
        </ul>
      </div>
      {limit !== null && (
        <button type="button" className="grid-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'pokaż mniej' : 'pokaż więcej'}
        </button>
      )}
    </div>
  );
}
