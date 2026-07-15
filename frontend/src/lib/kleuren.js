// Gedeeld kleurenpalet + naam-herkenning, gebruikt in zowel Filament.jsx (Voorraad)
// als Bestellingen.jsx (kleurenkiezer bij bestellen) — 1 bron zodat beide altijd
// dezelfde kleuren tonen voor dezelfde naam.

export const KLEUREN = [
  { naam: 'Wit',         hex: '#f5f5f5' },
  { naam: 'Zwart',       hex: '#1a1a1a' },
  { naam: 'Grijs',       hex: '#808080' },
  { naam: 'Rood',        hex: '#ef4444' },
  { naam: 'Blauw',       hex: '#3b82f6' },
  { naam: 'Groen',       hex: '#22c55e' },
  { naam: 'Geel',        hex: '#eab308' },
  { naam: 'Oranje',      hex: '#f97316' },
  { naam: 'Paars',       hex: '#a855f7' },
  { naam: 'Roze',        hex: '#ec4899' },
  { naam: 'Bruin',       hex: '#92400e' },
  { naam: 'Beige',       hex: '#d4b896' },
  { naam: 'Zilver',      hex: '#c0c0c0' },
  { naam: 'Goud',        hex: '#d4af37' },
  { naam: 'Transparant', hex: '#e0f2fe' },
];

export const KLEUR_GROEPEN = {
  'lavendel':'#a855f7','lila':'#a855f7','violet':'#a855f7','magenta':'#ec4899',
  'fuchsia':'#ec4899','zalm':'#f97316','koraal':'#f97316','bordeaux':'#ef4444',
  'donkerrood':'#ef4444','turquoise':'#14b8a6','mintgroen':'#22c55e','limoen':'#eab308',
  'marineblauw':'#3b82f6','donkerblauw':'#3b82f6','lichtblauw':'#3b82f6',
  'crème':'#d4b896','ivoor':'#f5f5f5','antraciet':'#808080','zwartgrijs':'#808080',
  'koper':'#d4af37','brons':'#92400e','naturel':'#d4b896','fluorescerend':'#eab308',
  'appelblauwzeegroen':'#14b8a6',
};

export function kleurHex(naam, hex) {
  if (hex) return hex;
  if (!naam) return '#555';
  const lower = naam.toLowerCase();
  const exacte = KLEUREN.find(k => k.naam?.toLowerCase() === lower);
  if (exacte) return exacte.hex;
  return KLEUR_GROEPEN[lower] || '#555';
}
