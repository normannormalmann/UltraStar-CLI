/** Nicht-Genres (v.a. Last.fm-Tags), die nie als Genre gelten dürfen. */
const BLOCKLIST = new Set([
  "seen live", "favorites", "favourite", "favourites", "spotify",
  "my music", "awesome", "beautiful", "love", "german", "english",
  "deutsch", "00s", "10s", "60s", "70s", "80s", "90s", "2000s",
]);

/** Varianten → kanonisches Genre (Schlüssel lowercase). */
const CANONICAL: Record<string, string> = {
  "hip hop": "Hip-Hop",
  "hip-hop": "Hip-Hop",
  "hiphop": "Hip-Hop",
  "rap/hip hop": "Hip-Hop",
  "rap": "Rap",
  "r&b": "R&B",
  "rnb": "R&B",
  "r&b/soul": "R&B",
  "soul & funk": "Soul",
  "electro": "Electronic",
  "electronica": "Electronic",
  "dance & edm": "Dance",
  "edm": "Dance",
  "alternative rock": "Rock",
  "alternative": "Rock",
  "indie rock": "Rock",
  "hard rock": "Rock",
  "heavy metal": "Metal",
  "singer-songwriter": "Folk",
  "singer/songwriter": "Folk",
  "films/games": "Soundtrack",
  "film scores": "Soundtrack",
  "musicals": "Musical",
  "comédies musicales": "Musical",
  "chanson française": "Chanson",
  "country & folk": "Country",
  "kids & family": "Kinderlieder",
  "christmas": "Christmas",
  "weihnachten": "Christmas",
};

const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");

/** Roh-Genre einer Quelle normalisieren; null = unbrauchbar. */
export const normalizeGenre = (raw: string): string | null => {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length === 0) return null;
  if (BLOCKLIST.has(cleaned)) return null;
  return CANONICAL[cleaned] ?? titleCase(cleaned);
};
