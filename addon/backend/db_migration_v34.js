// Migratie v34: kleurenpalet per artikeltype. Sommige filamenttypes (bv. een
// specifiek merk/materiaal) zijn maar in een vaste reeks kleuren verkrijgbaar
// — als je een palet instelt voor een type, mag je bij het aanmaken van
// voorraad van dat type enkel nog uit dat palet kiezen (geen vrije tekst/eigen
// HEX meer). Een type zonder palet werkt zoals voorheen (het globale palet +
// eigen kleuren).
export function migrateDbV34(db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS filament_type_kleuren (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filament_type_id INTEGER NOT NULL REFERENCES filament_types(id) ON DELETE CASCADE,
        naam TEXT NOT NULL,
        hex TEXT,
        volgorde INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_type_kleuren_type ON filament_type_kleuren(filament_type_id);
    `);
    console.log('Migratie v34: tabel filament_type_kleuren aangemaakt');

    // Vaste AnyCubic-kleurenpaletten (uit de officiële kleurenkaart), enkel
    // gekoppeld als het bijhorende artikeltype al bestaat — er wordt hier
    // bewust geen nieuw type aangemaakt (inkoopprijs is niet gekend).
    const PETG = [
      ['Zwart', '#212721'], ['Wit', '#EFF0F1'], ['Grijs', '#97999B'], ['Rood', '#C8102E'],
      ['Geel', '#F3E500'], ['Blauw', '#003594'], ['Groen', '#009639'], ['Paars', '#6A6DCD'],
      ['Oranje', '#FF7F32'], ['Roze', '#FB637E'], ['Textuurgrijs', '#75787B'], ['Textuurzilver', '#8A8D8F'],
      ['Donkergrijs', '#7E868A'], ['Bruin', '#927968'], ['Beige', '#D4B996'], ['Pindabruin', '#A9754F'],
      ['Crème', '#F9DFB9'], ['Meerblauw', '#0084D4'], ['Bosgroen', '#43523B'], ['Limoengroen', '#78D64B'],
    ];
    const PLA_BASIC = [
      ['Transparant', null], ['Wit', '#EFF0F1'], ['Mia-wit', '#F1E9E0'], ['Mia-roze', '#FAD6C6'],
      ['Perzikroze', '#FFC196'], ['Geel', '#F3E500'], ['Goud', '#FFB81C'], ['Oranje', '#FF7F32'],
      ['Roze', '#FF8DA1'], ['Magenta', '#CF4F80'], ['Textuurrood', '#EF3340'], ['Rood', '#CE3845'],
      ['Paars', '#6A6DCD'], ['Interstellair violet', '#5B618F'], ['Cyaan', '#23A3C7'], ['Tropisch turkoois', '#009CBD'],
      ['Blauw', '#003594'], ['Lentegroen', '#89A84F'], ['Olijfgroen', '#658946'], ['Groen', '#009639'],
      ['Beige', '#D4B996'], ['Bruin', '#927968'], ['Brons', '#7C4D3A'], ['Lichtgrijs', '#DAD9DB'],
      ['Grijs', '#B1B3B3'], ['Textuurzilver', '#8A8D8F'], ['Textuurgrijs', '#75787B'], ['Blauwgrijs', '#768692'],
      ['Zwart', '#212721'],
    ];

    const zetPalet = (matchSql, palet, label) => {
      const types = db.prepare(matchSql).all();
      if (types.length === 0) {
        console.log(`Migratie v34: geen artikeltype gevonden voor "${label}" — palet niet gekoppeld`);
        return;
      }
      const insert = db.prepare('INSERT INTO filament_type_kleuren (filament_type_id, naam, hex, volgorde) VALUES (?,?,?,?)');
      for (const t of types) {
        const bestaat = db.prepare('SELECT COUNT(*) as n FROM filament_type_kleuren WHERE filament_type_id = ?').get(t.id).n;
        if (bestaat > 0) { console.log(`Migratie v34: type ${t.id} (${label}) heeft al een palet, overgeslagen`); continue; }
        palet.forEach(([naam, hex], i) => insert.run(t.id, naam, hex, i));
        console.log(`Migratie v34: ${label}-palet (${palet.length} kleuren) gekoppeld aan artikeltype ${t.id}`);
      }
    };

    zetPalet(
      "SELECT id FROM filament_types WHERE LOWER(merk) LIKE '%anycubic%' AND LOWER(materiaal) LIKE '%petg%'",
      PETG, 'AnyCubic PETG'
    );
    zetPalet(
      "SELECT id FROM filament_types WHERE LOWER(merk) LIKE '%anycubic%' AND LOWER(materiaal) LIKE '%pla%basic%'",
      PLA_BASIC, 'AnyCubic PLA Basic'
    );
  } catch (e) {
    console.error('Migratie v34 fout:', e.message);
  }
}
