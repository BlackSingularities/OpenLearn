import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tytuł zawijany „piramidalnie”: wiersze wypełniane od dołu – górne są krótsze, dolny najdłuższy.
 * Każdy wiersz (od ostatniego) bierze z końca tytułu tyle słów, ile zmieści się w szerokości.
 */
export function PyramidTitle({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [lines, setLines] = useState<string[]>([text]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = text.split(' ');
    const layout = () => {
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (avail <= 0) return;
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
      document.body.appendChild(probe);
      const fits = (s: string) => {
        probe.textContent = s;
        return probe.getBoundingClientRect().width <= avail + 0.5;
      };
      const out: string[] = [];
      let end = words.length;
      while (end > 0) {
        let start = end - 1;
        while (start > 0 && fits(words.slice(start - 1, end).join(' '))) start--;
        out.unshift(words.slice(start, end).join(' '));
        end = start;
      }
      probe.remove();
      setLines((prev) => (prev.join('\n') === out.join('\n') ? prev : out));
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <h3 ref={ref} className={className}>
      {lines.map((l, i) => (
        <span key={i} style={{ display: 'block' }}>
          {l}
        </span>
      ))}
    </h3>
  );
}
