import { useEffect, useState } from 'react';

/** true na wąskich ekranach (telefon) – sceny SVG mogą wtedy użyć ciaśniejszego układu i większych napisów. */
export function useNarrow(maxWidth = 600): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}
