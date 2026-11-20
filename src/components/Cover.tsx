import type { ReactNode } from 'react';

/**
 * Okładki tematów: proste rysunki liniowe (jak szkic w zeszycie laboratoryjnym) zamiast emoji.
 * Kreski w kolorze tekstu, wyróżnienia w kolorze akcentu tematu. Pole rysunku: 320 × 180.
 */

const A = 'var(--accent)';

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => `${cx + Math.cos(a) * r} ${cy - Math.sin(a) * r}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 0 ${p(a1)}`;
}

function curve(f: (x: number) => number, x0: number, x1: number, n = 48) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    d += `${i ? 'L' : 'M'} ${x.toFixed(1)} ${f(x).toFixed(1)} `;
  }
  return d;
}

const motifs: Record<string, ReactNode> = {
  'funkcja-kwadratowa': (
    <>
      <path d="M40 140 H280 M160 24 V160" className="cv-axis" />
      <path d={curve((x) => 40 + ((x - 172) ** 2) / 70, 92, 252)} className="cv-ink" />
      <path d="M172 40 V140" className="cv-dash" />
      <circle cx="172" cy="40" r="5" fill={A} />
      <circle cx="122" cy="140" r="4" className="cv-dot" />
      <circle cx="222" cy="140" r="4" className="cv-dot" />
    </>
  ),
  'okrag-jednostkowy': (
    <>
      <path d="M40 90 H120 M80 50 V130 M140 90 H290" className="cv-axis" />
      <circle cx="80" cy="90" r="36" className="cv-ink" />
      <path d="M80 90 L105 64" className="cv-ink" stroke={A} />
      <path d="M105 64 V90" className="cv-dash" />
      <path d="M105 64 H160" className="cv-dash" />
      <path d={curve((x) => 90 - Math.sin((x - 140) / 22) * 36, 140, 290, 80)} className="cv-ink" />
      <circle cx="105" cy="64" r="5" fill={A} />
      <circle cx="160" cy="64" r="4" fill={A} />
    </>
  ),
  pochodna: (
    <>
      <path d="M40 150 H285 M60 24 V160" className="cv-axis" />
      <path d={curve((x) => 100 - Math.sin((x - 60) / 34) * 42 + (x - 60) * 0.05, 60, 280, 80)} className="cv-ink" />
      <path d="M110 136 L250 30" className="cv-ink" stroke={A} />
      <circle cx="176" cy="86" r="5" fill={A} />
      <path d="M176 86 H206 V64" className="cv-dash" />
    </>
  ),
  'rzut-ukosny': (
    <>
      <path d="M30 150 H295" className="cv-axis" />
      <path d={curve((x) => 150 - 4 * 82 * ((x - 40) / 190) * (1 - (x - 40) / 190), 40, 230)} className="cv-dash" />
      <path d={curve((x) => 150 - 4 * 28 * ((x - 40) / 190) * (1 - (x - 40) / 190), 40, 230)} className="cv-dash" />
      <path d={curve((x) => 150 - 4 * 56 * ((x - 40) / 220) * (1 - (x - 40) / 220), 40, 260)} className="cv-ink" stroke={A} />
      <path d="M40 150 L66 124" className="cv-ink" />
      <path d={arcPath(40, 150, 24, 0, Math.PI / 4)} className="cv-thin" />
      <path d="M150 94 V150" className="cv-dash" />
      <circle cx="150" cy="94" r="5.5" fill={A} />
      <circle cx="260" cy="150" r="4" className="cv-dot" />
    </>
  ),
  drgania: (
    <>
      <path d="M60 26 H140" className="cv-axis" />
      <path d="M100 26 L130 118" className="cv-ink" />
      <path d={arcPath(100, 26, 97, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42)} className="cv-dash" />
      <path d="M100 26 V123" className="cv-thin" />
      <circle cx="130" cy="118" r="12" fill={A} />
      <path d="M200 26 H280 M240 26 V40 l-12 6 24 8 -24 8 24 8 -24 8 24 8 -12 6 V112" className="cv-ink" />
      <rect x="222" y="112" width="36" height="28" rx="4" fill={A} />
    </>
  ),
  'prawa-keplera': (
    <>
      <ellipse cx="160" cy="90" rx="120" ry="80" className="cv-ink" />
      <path d="M71 90 L56 50 A120 80 0 0 0 56 130 Z" fill={A} opacity="0.3" />
      <path d="M71 90 L277.4 106.6 A120 80 0 0 0 277.4 73.4 Z" fill={A} opacity="0.3" />
      <circle cx="71" cy="90" r="11" fill={A} />
      <circle cx="249" cy="90" r="2.5" className="cv-dot" />
      <circle cx="277.4" cy="73.4" r="5.5" className="cv-dot" />
    </>
  ),
  'fale-i-interferencja': (
    <>
      {[16, 34, 52, 70, 88, 106].map((r) => (
        <g key={r}>
          <circle cx="120" cy="90" r={r} className="cv-thin" />
          <circle cx="200" cy="90" r={r} className="cv-thin" />
        </g>
      ))}
      <path d="M160 0 V180" className="cv-ink" stroke={A} />
      <circle cx="120" cy="90" r="5" fill={A} />
      <circle cx="200" cy="90" r="5" fill={A} />
    </>
  ),
  'pole-elektryczne': (
    <>
      {[-0.9, -0.45, 0, 0.45, 0.9].map((k) => (
        <path key={k} d={`M104 90 C ${150} ${90 - k * 120}, ${170} ${90 - k * 120}, 216 90`} className="cv-thin" />
      ))}
      {[-2.4, 2.4, -2.9, 2.9].map((a, i) => (
        <path key={i} d={`M${i % 2 ? 216 : 104} 90 l ${(i % 2 ? 1 : -1) * 60} ${a > 0 ? 40 : -40}`} className="cv-thin" />
      ))}
      <circle cx="104" cy="90" r="15" fill={A} />
      <circle cx="216" cy="90" r="15" className="cv-solid" />
      <path d="M97 90 h14 M104 83 v14" stroke="var(--cover-bg)" strokeWidth="3" strokeLinecap="round" />
      <path d="M209 90 h14" stroke="var(--cover-bg)" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  'wiazania-chemiczne': (
    <>
      <circle cx="125" cy="90" r="22" className="cv-ink" />
      <circle cx="125" cy="90" r="46" className="cv-thin" />
      <circle cx="195" cy="90" r="22" className="cv-ink" />
      <circle cx="195" cy="90" r="46" className="cv-thin" />
      <circle cx="125" cy="90" r="7" className="cv-solid" />
      <circle cx="195" cy="90" r="7" className="cv-solid" />
      <circle cx="160" cy="70" r="6" fill={A} />
      <circle cx="160" cy="110" r="6" fill={A} />
      <circle cx="79" cy="90" r="4" className="cv-dot" />
      <circle cx="241" cy="90" r="4" className="cv-dot" />
    </>
  ),
  'ksztalty-czasteczek': (
    <>
      <path d="M160 92 L160 30 M160 92 L98 128 M160 92 L222 128" className="cv-ink" />
      <path d="M160 92 L196 110" className="cv-dash" />
      <circle cx="160" cy="30" r="11" className="cv-solid" />
      <circle cx="98" cy="128" r="11" className="cv-solid" />
      <circle cx="222" cy="128" r="11" className="cv-solid" />
      <circle cx="198" cy="111" r="8" className="cv-dot" />
      <circle cx="160" cy="92" r="17" fill={A} />
      <path d={arcPath(160, 92, 30, Math.PI / 2, Math.PI + 0.52)} className="cv-thin" stroke={A} />
    </>
  ),
  'orbitale-atomowe': (
    <>
      <path d="M160 90 C 120 40, 70 40, 70 90 C 70 140, 120 140, 160 90 C 200 40, 250 40, 250 90 C 250 140, 200 140, 160 90 Z" className="cv-ink" fill={A} fillOpacity="0.18" />
      <path d="M160 90 C 120 70, 105 30, 160 22 C 215 30, 200 70, 160 90 C 120 110, 105 150, 160 158 C 215 150, 200 110, 160 90 Z" className="cv-thin" />
      <path d="M50 90 H270 M160 14 V166" className="cv-axis" />
      <circle cx="160" cy="90" r="5" className="cv-solid" />
    </>
  ),
  'kinetyka-rownowaga': (
    <>
      <rect x="40" y="26" width="140" height="128" rx="8" className="cv-thin" />
      {[
        [64, 52, 14, -6], [120, 44, -10, 10], [150, 80, 12, 8], [80, 104, 8, -12], [130, 124, -14, -4], [100, 72, 10, 12], [62, 134, 14, 2],
      ].map(([x, y, dx, dy], i) => (
        <g key={i}>
          <path d={`M${x} ${y} l ${dx} ${dy}`} className="cv-thin" />
          <circle cx={x} cy={y} r="6" fill={i % 3 === 0 ? A : undefined} className={i % 3 === 0 ? '' : 'cv-solid'} />
        </g>
      ))}
      <path d="M205 80 H280 l-10 -8 M280 100 H205 l10 8" className="cv-ink" stroke={A} />
    </>
  ),
  'budowa-atomu': (
    <>
      <ellipse cx="160" cy="90" rx="110" ry="34" className="cv-thin" transform="rotate(-18 160 90)" />
      <ellipse cx="160" cy="90" rx="62" ry="22" className="cv-ink" transform="rotate(24 160 90)" />
      {[[152, 84], [166, 84], [159, 96], [146, 96], [172, 96], [159, 76]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="7" fill={i % 2 ? undefined : A} className={i % 2 ? 'cv-solid' : undefined} />
      ))}
      <circle cx="215" cy="113" r="5" className="cv-dot" />
      <circle cx="58" cy="120" r="5" fill={A} />
    </>
  ),
  'uklad-okresowy': (
    <>
      {[0, 1, 2, 3, 4].map((r) =>
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => {
          const on = r === 0 ? c === 0 || c === 11 : r === 1 ? c < 2 || c > 6 : true;
          if (!on) return null;
          return <rect key={`${r}-${c}`} x={46 + c * 20} y={30 + r * 24} width="17" height="20" rx="3" fill={c === 9 && r === 2 ? A : undefined} className={c === 9 && r === 2 ? undefined : 'cv-thin'} />;
        }),
      )}
      <path d="M50 160 L270 160" className="cv-ink" stroke={A} />
      <path d="M262 154 l8 6 -8 6" className="cv-ink" stroke={A} />
    </>
  ),
  promieniotworczosc: (
    <>
      <circle cx="80" cy="90" r="20" fill={A} />
      <path d="M110 64 H150" className="cv-ink" />
      <path d={curve((x) => 90 + Math.sin((x - 110) / 6) * 9, 110, 230, 80)} className="cv-ink" stroke={A} />
      <path d="M110 116 C 160 116, 200 150, 270 150" className="cv-dash" />
      <rect x="160" y="40" width="10" height="44" rx="2" className="cv-solid" />
      <rect x="240" y="40" width="14" height="110" rx="2" className="cv-thin" />
    </>
  ),
  'mol-stechiometria': (
    <>
      <path d="M40 140 H130 M40 140 L60 60 H110 L130 140" className="cv-ink" />
      {[[70, 120], [90, 110], [108, 124], [84, 92]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" className="cv-solid" />
      ))}
      <path d="M150 90 H190 l-10 -8 M190 90 l-10 8" className="cv-ink" stroke={A} />
      {[[220, 70], [250, 70], [235, 96], [220, 122], [250, 122]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill={A} />
      ))}
    </>
  ),
  roztwory: (
    <>
      <path d="M100 30 V150 Q100 160 110 160 H210 Q220 160 220 150 V30" className="cv-ink" />
      <path d="M102 78 H218 V148 Q218 158 208 158 H112 Q102 158 102 148 Z" fill={A} opacity="0.22" />
      <path d="M102 78 H218" className="cv-ink" stroke={A} />
      {[[124, 100], [150, 120], [180, 96], [200, 128], [140, 140], [168, 136]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill={A} />
      ))}
      <path d="M112 156 Q160 142 208 156" className="cv-solid" />
    </>
  ),
  'kwasy-zasady-ph': (
    <>
      <path d="M40 150 H280" className="cv-axis" />
      {Array.from({ length: 15 }, (_, i) => (
        <rect key={i} x={40 + i * 16} y="152" width="14" height="10" rx="2" fill={A} opacity={0.15 + Math.abs(i - 7) * 0.11} />
      ))}
      <path d={curve((x) => 140 - 100 / (1 + Math.exp(-(x - 170) / 9)), 50, 280, 90)} className="cv-ink" stroke={A} />
      <path d="M50 90 H280" className="cv-dash" />
      <circle cx="170" cy="90" r="5" className="cv-dot" />
    </>
  ),
  elektrochemia: (
    <>
      <path d="M50 70 V150 H140 V70 M180 70 V150 H270 V70" className="cv-ink" />
      <rect x="82" y="40" width="14" height="90" rx="2" fill={A} />
      <rect x="222" y="40" width="14" height="90" rx="2" className="cv-solid" />
      <path d="M89 40 V22 H229 V40" className="cv-ink" />
      <path d="M120 96 H200 M120 96 V80 M200 96 V80" className="cv-thin" />
      <circle cx="159" cy="22" r="10" className="cv-ink" fill="var(--cover-bg)" />
      <circle cx="140" cy="22" r="3.5" fill={A} />
    </>
  ),
  'chemia-organiczna': (
    <>
      <path d="M50 110 L90 80 L130 110 L170 80 L210 110 L250 80" className="cv-ink" />
      {[[50, 110], [90, 80], [130, 110], [170, 80], [210, 110]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8" className="cv-solid" />
      ))}
      <path d="M250 80 L276 58 M250 80 L282 92" className="cv-ink" stroke={A} />
      <circle cx="250" cy="80" r="8" className="cv-solid" />
      <circle cx="278" cy="56" r="9" fill={A} />
      <circle cx="286" cy="94" r="6" className="cv-dot" />
    </>
  ),
  'stany-skupienia': (
    <>
      {[0, 1, 2].map((i) => [0, 1, 2].map((j) => <circle key={`s${i}${j}`} cx={44 + i * 18} cy={98 + j * 18} r="7" className="cv-solid" />))}
      {[[130, 132], [146, 126], [162, 134], [138, 116], [156, 112], [170, 120], [126, 104]].map(([x, y], i) => (
        <circle key={`l${i}`} cx={x} cy={y} r="7" fill={A} />
      ))}
      {[[230, 40], [276, 70], [250, 110], [292, 128], [216, 140]].map(([x, y], i) => (
        <g key={`g${i}`}>
          <circle cx={x} cy={y} r="6" className="cv-solid" />
          <path d={`M${x} ${y} l ${i % 2 ? -18 : 16} ${i % 3 ? 12 : -14}`} className="cv-thin" />
        </g>
      ))}
      <path d="M30 150 H300" className="cv-axis" />
    </>
  ),
  'sieci-krystaliczne': (
    <>
      <path d="M110 60 H190 V140 H110 Z M140 36 H220 V116 H190 M110 60 L140 36 M190 60 L220 36" className="cv-ink" />
      <path d="M140 36 V116 H190 M110 140 L140 116" className="cv-dash" />
      {[[110, 60], [190, 60], [110, 140], [190, 140], [140, 36], [220, 36], [220, 116], [140, 116]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8" className="cv-solid" />
      ))}
      <circle cx="165" cy="88" r="13" fill={A} />
    </>
  ),
  wersyfikacja: (
    <>
      {[40, 80, 120].map((y, r) => (
        <g key={y}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x={46 + i * 34 + (i > 3 ? 14 : 0)} y={y} width="26" height="20" rx="5" className={(i + r) % 2 === 0 ? undefined : 'cv-thin'} fill={(i + r) % 2 === 0 ? A : undefined} />
          ))}
        </g>
      ))}
      <path d="M190 32 V148" className="cv-dash" />
    </>
  ),
  'srodki-stylistyczne': (
    <>
      <text x="44" y="78" className="cv-serif" fontSize="44">„</text>
      <path d="M78 64 H262 M78 92 H230 M78 120 H250" className="cv-ink" />
      <path d={curve((x) => 104 + Math.sin(x / 5) * 3, 120, 230, 60)} className="cv-ink" stroke={A} />
      <rect x="140" y="52" width="70" height="24" rx="6" fill={A} opacity="0.25" />
    </>
  ),
  'zdanie-zlozone': (
    <>
      <path d="M160 46 L96 104 M160 46 L224 104 M224 104 L192 146 M224 104 L256 146" className="cv-ink" />
      <rect x="128" y="28" width="64" height="26" rx="7" fill={A} />
      <rect x="64" y="96" width="64" height="24" rx="7" className="cv-solid" />
      <rect x="192" y="96" width="64" height="24" rx="7" className="cv-solid" />
      <rect x="168" y="140" width="48" height="20" rx="6" className="cv-thin" />
      <rect x="232" y="140" width="48" height="20" rx="6" className="cv-thin" />
    </>
  ),
  'epoki-literackie': (
    <>
      <path d="M36 158 H288" className="cv-axis" />
      {[
        [40, 60], [80, 70], [140, 34], [168, 34], [196, 30], [220, 22], [240, 18], [256, 14], [268, 10], [276, 12],
      ].map(([x, w], i) => (
        <rect key={i} x={x} y={24 + i * 13} width={w} height="9" rx="4.5" fill={i === 5 ? A : undefined} className={i === 5 ? '' : 'cv-solid'} opacity={i === 5 ? 1 : 0.35 + i * 0.05} />
      ))}
    </>
  ),
  'english-tenses': (
    <>
      <path d="M30 100 H280 l-10 -7 M280 100 l-10 7" className="cv-ink" />
      <path d="M160 66 V134" className="cv-ink" stroke={A} />
      <path d="M70 100 m-6 -6 l12 12 m0 -12 l-12 12" className="cv-ink" />
      <path d="M96 76 H210" className="cv-ink" stroke={A} strokeWidth="6" strokeLinecap="round" />
      <path d={curve((x) => 132 + Math.sin((x - 180) / 7) * 5, 180, 250, 50)} className="cv-ink" />
      <circle cx="160" cy="100" r="6" fill={A} />
    </>
  ),
  'english-passive': (
    <>
      <rect x="40" y="46" width="90" height="34" rx="8" fill={A} />
      <rect x="190" y="46" width="90" height="34" rx="8" className="cv-solid" />
      <rect x="40" y="108" width="90" height="34" rx="8" className="cv-solid" />
      <rect x="190" y="108" width="90" height="34" rx="8" fill={A} />
      <path d="M85 84 C 120 100, 200 92, 235 104 M235 84 C 200 96, 120 92, 85 104" className="cv-ink" />
    </>
  ),
  'english-conditionals': (
    <>
      <path d="M40 90 H130 C 170 90, 170 44, 220 44 H280 M130 90 C 170 90, 170 136, 220 136 H280" className="cv-ink" />
      <path d="M130 90 C 170 90, 170 44, 220 44 H280" className="cv-ink" stroke={A} />
      <path d="M118 78 l12 12 -12 12 -12 -12 Z" fill={A} />
      <circle cx="280" cy="44" r="6" fill={A} />
      <circle cx="280" cy="136" r="6" className="cv-dot" />
    </>
  ),
  'english-reported-speech': (
    <>
      <path d="M40 40 H150 a10 10 0 0 1 10 10 V86 a10 10 0 0 1 -10 10 H72 l-16 16 V96 H50 a10 10 0 0 1 -10 -10 V50 a10 10 0 0 1 10 -10" className="cv-ink" />
      <path d="M56 58 H140 M56 76 H118" className="cv-thin" />
      <path d="M168 120 H272 a8 8 0 0 0 8 -8 V88 a8 8 0 0 0 -8 -8 H186 a8 8 0 0 0 -8 8 V112" className="cv-ink" stroke={A} />
      <path d="M192 96 H264 M192 108 H240" className="cv-thin" stroke={A} />
      <path d="M140 108 C 150 128, 160 132, 170 124 l-2 -10" className="cv-dash" />
    </>
  ),
  'funkcja-liniowa': (
    <>
      <path d="M40 140 H285 M90 22 V160" className="cv-axis" />
      <path d="M40 150 L280 40" className="cv-ink" stroke={A} />
      <path d="M40 110 L280 0" className="cv-dash" />
      <path d="M150 99.6 H210 V72" className="cv-ink" />
      <circle cx="90" cy="127" r="5" fill={A} />
    </>
  ),
  'przeksztalcenia-wykresow': (
    <>
      <path d="M30 140 H290 M110 20 V165" className="cv-axis" />
      <path d={curve((x) => 140 - ((x - 110) ** 2) / 60, 50, 170)} className="cv-dash" />
      <path d={curve((x) => 100 - ((x - 200) ** 2) / 60, 140, 260)} className="cv-ink" stroke={A} />
      <path d="M110 140 L194 104" className="cv-ink" />
      <circle cx="200" cy="100" r="5" fill={A} />
    </>
  ),
  wielomiany: (
    <>
      <path d="M30 100 H290" className="cv-axis" />
      <path d={curve((x) => 100 - ((x - 80) * (x - 160) ** 2 * (x - 250)) / 26000, 55, 270, 90)} className="cv-ink" />
      <circle cx="80" cy="100" r="5" fill={A} />
      <circle cx="160" cy="100" r="6.5" fill={A} />
      <circle cx="250" cy="100" r="5" fill={A} />
    </>
  ),
  'funkcja-wymierna': (
    <>
      <path d="M150 15 V170 M30 80 H290" className="cv-dash" />
      <path d={curve((x) => 80 - 1800 / (x - 150), 165, 290, 60)} className="cv-ink" stroke={A} />
      <path d={curve((x) => 80 - 1800 / (x - 150), 30, 135, 60)} className="cv-ink" stroke={A} />
    </>
  ),
  'funkcja-wykladnicza': (
    <>
      <path d="M30 150 H290 M160 15 V165" className="cv-axis" />
      <path d={curve((x) => 150 - 30 * Math.pow(2, (x - 160) / 35), 30, 255, 80)} className="cv-ink" stroke={A} />
      <path d={curve((x) => 150 - 30 * Math.pow(2, -(x - 160) / 35), 65, 290, 80)} className="cv-dash" />
      <circle cx="160" cy="120" r="5" fill={A} />
    </>
  ),
  'wykresy-trygonometryczne': (
    <>
      <path d="M20 90 H300" className="cv-axis" />
      <path d={curve((x) => 90 - Math.sin((x - 20) / 30) * 50, 20, 300, 120)} className="cv-ink" stroke={A} />
      <path d={curve((x) => 90 - Math.cos((x - 20) / 30) * 50, 20, 300, 120)} className="cv-dash" />
      <path d="M20 40 H300 M20 140 H300" className="cv-thin" />
    </>
  ),
  ciagi: (
    <>
      <path d="M30 160 H290" className="cv-axis" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} x={40 + i * 31} y={160 - 14 - i * 16} width="22" height={14 + i * 16} rx="4" fill={i === 7 ? A : undefined} className={i === 7 ? undefined : 'cv-solid'} opacity={i === 7 ? 1 : 0.3 + i * 0.07} />
      ))}
    </>
  ),
  'zastosowania-pochodnej': (
    <>
      <path d="M30 150 H290" className="cv-axis" />
      <path d={curve((x) => 100 - Math.sin((x - 30) / 42) * 55, 30, 290, 90)} className="cv-ink" />
      <path d="M50 45 H150" className="cv-ink" stroke={A} />
      <circle cx="96" cy="45" r="6" fill={A} />
      <path d="M200 155 H290" className="cv-ink" stroke={A} />
      <circle cx="227" cy="155" r="5" className="cv-dot" />
    </>
  ),
  'pitagoras-trygonometria': (
    <>
      <rect x="70" y="30" width="120" height="120" className="cv-thin" />
      <path d="M118 30 L190 78 L142 150 L70 102 Z" fill={A} opacity="0.3" />
      <path d="M118 30 L190 78 L142 150 L70 102 Z" className="cv-ink" stroke={A} />
      <path d="M220 140 H290 V60 Z" className="cv-ink" />
      <path d="M280 140 V130 H290" className="cv-thin" />
    </>
  ),
  'podobienstwo-tales': (
    <>
      <path d="M30 160 L290 160 M30 160 L270 30" className="cv-ink" />
      <path d="M120 160 L120 111" className="cv-ink" stroke={A} />
      <path d="M230 160 L230 52" className="cv-ink" stroke={A} />
      <circle cx="30" cy="160" r="4" className="cv-dot" />
    </>
  ),
  'katy-w-okregu': (
    <>
      <circle cx="160" cy="90" r="70" className="cv-ink" />
      <path d="M110 139 L160 90 L210 139" className="cv-ink" stroke={A} />
      <path d="M110 139 L180 23 L210 139" className="cv-thin" />
      <circle cx="160" cy="90" r="4" fill={A} />
      <circle cx="180" cy="23" r="5" className="cv-dot" />
    </>
  ),
  'geometria-analityczna': (
    <>
      <path d="M30 150 H290 M60 15 V165" className="cv-axis" />
      <circle cx="190" cy="85" r="48" className="cv-ink" />
      <path d="M40 160 L290 20" className="cv-ink" stroke={A} />
      <path d="M60 150 L130 70" className="cv-ink" />
      <circle cx="190" cy="85" r="4" fill={A} />
    </>
  ),
  bryly: (
    <>
      <path d="M90 140 L160 160 L230 140 L160 30 Z M90 140 L160 30 M160 160 L160 30" className="cv-ink" />
      <path d="M90 140 L160 120 L230 140" className="cv-dash" />
      <path d="M160 120 L160 30" className="cv-dash" />
      <path d="M120 95 L200 95 L185 115 L135 115 Z" fill={A} opacity="0.55" />
    </>
  ),
  prawdopodobienstwo: (
    <>
      {[0, 1, 2, 3, 4].map((r) => [...Array(r + 1)].map((_, i) => <circle key={`${r}-${i}`} cx={160 + (i - r / 2) * 26} cy={22 + r * 18} r="3" className="cv-dot" />))}
      {[2, 8, 18, 26, 18, 8, 2].map((h, i) => (
        <rect key={i} x={74 + i * 26} y={165 - h * 2.2} width="20" height={h * 2.2} rx="3" fill={i === 3 ? A : undefined} className={i === 3 ? undefined : 'cv-solid'} opacity={i === 3 ? 1 : 0.55} />
      ))}
    </>
  ),
  statystyka: (
    <>
      <path d="M30 130 H290" className="cv-axis" />
      {[50, 80, 80, 110, 110, 110, 140, 170, 260].map((x, i, arr) => {
        const n = arr.slice(0, i).filter((v) => v === x).length;
        return <circle key={i} cx={x} cy={118 - n * 18} r="7" className="cv-solid" />;
      })}
      <path d="M134 134 l-12 22 h24 z" fill={A} />
      <path d="M110 30 V150" className="cv-dash" />
    </>
  ),
  kinematyka: (
    <>
      <path d="M30 150 H290" className="cv-axis" />
      <path d={curve((x) => 150 - ((x - 40) ** 2) / 520, 40, 280)} className="cv-ink" stroke={A} />
      <path d="M40 150 L280 40" className="cv-dash" />
      {[60, 100, 150, 210, 270].map((x) => (
        <circle key={x} cx={x} cy="165" r="4" fill={A} />
      ))}
    </>
  ),
  dynamika: (
    <>
      <path d="M40 150 H280 L40 50 Z" className="cv-ink" />
      <g transform="rotate(22.6 150 95)">
        <rect x="128" y="73" width="44" height="30" rx="4" fill={A} />
      </g>
      <path d="M150 100 V150" className="cv-ink" />
      <path d="M150 100 l-24 -58" className="cv-thin" />
    </>
  ),
  'ped-zderzenia': (
    <>
      <path d="M30 140 H290" className="cv-axis" />
      <rect x="70" y="96" width="54" height="44" rx="6" fill={A} />
      <rect x="180" y="110" width="34" height="30" rx="6" className="cv-solid" />
      <path d="M70 80 h60 M200 92 h-30" className="cv-ink" />
    </>
  ),
  'energia-mechaniczna': (
    <>
      <path d={curve((x) => 140 - 100 * Math.exp(-((x - 40) ** 2) / 1200) - 50 * Math.exp(-((x - 190) ** 2) / 900) - 80 * Math.exp(-((x - 300) ** 2) / 900), 20, 300, 90)} className="cv-ink" />
      <circle cx="72" cy="60" r="9" fill={A} />
      <path d="M20 40 H300" className="cv-dash" />
    </>
  ),
  'ruch-po-okregu': (
    <>
      <circle cx="140" cy="90" r="62" className="cv-dash" />
      <path d="M140 90 L184 46" className="cv-thin" />
      <circle cx="184" cy="46" r="10" fill={A} />
      <path d="M184 46 L240 102" className="cv-ink" />
      <path d="M184 46 L162 68" className="cv-ink" stroke={A} />
    </>
  ),
  grawitacja: (
    <>
      <circle cx="160" cy="110" r="48" fill={A} opacity="0.35" />
      <circle cx="160" cy="110" r="48" className="cv-ink" />
      <ellipse cx="160" cy="100" rx="96" ry="64" className="cv-dash" />
      <path d={curve((x) => 62 + ((x - 160) ** 2) / 60, 160, 205)} className="cv-ink" stroke={A} />
      <circle cx="160" cy="58" r="4" className="cv-dot" />
    </>
  ),
  hydrostatyka: (
    <>
      <rect x="70" y="40" width="180" height="120" className="cv-ink" />
      <rect x="72" y="80" width="176" height="78" fill={A} opacity="0.25" />
      <path d="M72 80 H248" className="cv-ink" stroke={A} />
      <rect x="140" y="60" width="40" height="40" rx="3" className="cv-solid" />
      <path d="M160 130 V104" className="cv-ink" stroke={A} />
    </>
  ),
  'gaz-doskonaly': (
    <>
      <path d="M110 30 V160 H210 V30" className="cv-ink" />
      <rect x="112" y="62" width="96" height="10" fill={A} />
      {[[130, 100], [160, 130], [190, 95], [145, 145], [185, 140], [170, 110], [125, 125]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" className={i % 3 ? 'cv-solid' : undefined} fill={i % 3 ? undefined : A} />
      ))}
    </>
  ),
  'prad-elektryczny': (
    <>
      <rect x="60" y="40" width="200" height="100" rx="6" className="cv-ink" />
      <rect x="130" y="30" width="60" height="20" rx="4" fill={A} />
      <path d="M52 80 H68 M56 96 H64" className="cv-ink" />
      {[90, 230, 260, 160].map((x, i) => (
        <circle key={i} cx={i === 2 ? 260 : x} cy={i === 2 ? 100 : i === 3 ? 140 : 140} r="4" className="cv-dot" />
      ))}
    </>
  ),
  'pole-magnetyczne': (
    <>
      {[60, 100, 140].map((r) => (
        <ellipse key={r} cx="160" cy="100" rx={r} ry={r * 0.32} className="cv-thin" />
      ))}
      <path d="M160 20 V170" className="cv-ink" stroke={A} />
      <path d={curve((x) => 100 - Math.sin((x - 60) / 14) * 18, 60, 260, 120)} className="cv-dash" />
    </>
  ),
  indukcja: (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <ellipse key={i} cx={150 + i * 12} cy="90" rx="10" ry="44" className="cv-ink" />
      ))}
      <rect x="40" y="76" width="40" height="28" fill={A} />
      <rect x="80" y="76" width="40" height="28" className="cv-solid" />
      <path d="M250 90 h40" className="cv-dash" />
    </>
  ),
  optyka: (
    <>
      <path d="M160 20 Q185 90 160 160 Q135 90 160 20" fill={A} opacity="0.3" />
      <path d="M30 90 H290" className="cv-axis" />
      <path d="M40 60 H160 L280 128" className="cv-ink" />
      <path d="M40 60 L280 124" className="cv-ink" stroke={A} />
      <circle cx="215" cy="90" r="4" className="cv-dot" />
    </>
  ),
  'fale-dzwiek': (
    <>
      {[20, 40, 60, 80, 100].map((r, i) => (
        <circle key={r} cx={130 + i * 6} cy="90" r={r} className="cv-thin" />
      ))}
      <circle cx="160" cy="90" r="8" fill={A} />
      <path d="M180 90 h40" className="cv-ink" stroke={A} />
    </>
  ),
  'fizyka-kwantowa': (
    <>
      {[30, 55, 85].map((r) => (
        <circle key={r} cx="110" cy="90" r={r} className="cv-thin" />
      ))}
      <circle cx="110" cy="90" r="7" fill={A} />
      <circle cx="165" cy="90" r="5" className="cv-dot" />
      <path d={curve((x) => 60 + Math.sin(x / 4) * 7, 190, 290, 80)} className="cv-ink" stroke={A} />
    </>
  ),
};

export function Cover({ id }: { id: string }) {
  return (
    <svg className="cover-svg" viewBox="0 0 320 180" aria-hidden focusable="false">
      <g className="cover-motif">{motifs[id] ?? <circle cx="160" cy="90" r="40" className="cv-ink" />}</g>
    </svg>
  );
}

/** Znak marki: atom-orbita z kropką akcentu. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" className="brand-mark">
      <rect width="32" height="32" rx="9" fill="var(--text)" />
      <ellipse cx="16" cy="16" rx="11" ry="4.6" fill="none" stroke="var(--bg)" strokeWidth="1.8" transform="rotate(-30 16 16)" />
      <ellipse cx="16" cy="16" rx="11" ry="4.6" fill="none" stroke="var(--bg)" strokeWidth="1.8" opacity="0.45" transform="rotate(30 16 16)" />
      <circle cx="16" cy="16" r="3.2" fill="#ff7a59" />
    </svg>
  );
}
