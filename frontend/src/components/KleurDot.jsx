// KleurDot.jsx — gedeeld kleurbolletje, gebruikt door Dashboard.jsx en Filament.jsx.
// Stond voorheen apart gedefinieerd in beide bestanden en was al lichtjes uit
// sync geraakt (marginRight 4 vs 6, title-tooltip wel/niet aanwezig) — dat is
// precies het soort drift dat deze samenvoeging voorkomt.
import { kleurHex } from '../lib/kleuren.js';

export default function KleurDot({ kleur, hex, size = 12 }) {
  return (
    <span
      title={kleur}
      style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        background: kleurHex(kleur, hex), border: '1px solid rgba(255,255,255,0.15)',
        marginRight: 6, verticalAlign: 'middle', flexShrink: 0,
      }}
    />
  );
}
