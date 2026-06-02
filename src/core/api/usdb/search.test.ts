import { expect, test } from "bun:test";
import { buildFormBody, parseSongFromTable, parseSongsFromSearch } from "./search.ts";

/**
 * Inner-HTML einer USDB-Ergebniszeile (Inhalt eines <tr>).
 * Hinweis: Das <a> in der Artist-Zelle ist bewusst UNGESCHLOSSEN — die
 * Parser-Regex `(?:<a.*?>)?(.*)<\/td>` würde ein `</a>` mit ins Capture
 * nehmen; USDBs reales HTML schließt diese Tags nicht.
 */
const songRow = (
  id: number,
  artist: string,
  title: string,
  language: string,
) => `
  <td onclick="show_detail(${id})" class="c"><a href="#">${artist}</td>
  <td class="c">${title}</td>
  <td class="c">Edition</td>
  <td class="c">yes</td>
  <td class="c">no</td>
  <td class="c">30.05.26</td>
  <td class="c">${language}</td>
  <td class="c">1080p</td>
`;

test("parses a single song row", () => {
  expect(parseSongFromTable(songRow(1234, "ABBA", "Dancing Queen", "English"))).toEqual({
    apiId: 1234,
    artist: "ABBA",
    title: "Dancing Queen",
    languages: ["english"],
  });
});

test("splits multiple languages and lowercases them", () => {
  const song = parseSongFromTable(
    songRow(7, "Nena", "99 Luftballons", "German, English"),
  );
  expect(song?.languages).toEqual(["german", "english"]);
});

test("decodes HTML entities in artist and title", () => {
  const song = parseSongFromTable(
    songRow(42, "Simon &amp; Garfunkel", "Don&#39;t Stop", "English"),
  );
  expect(song?.artist).toBe("Simon & Garfunkel");
  expect(song?.title).toBe("Don't Stop");
});

test("returns null for unparseable input", () => {
  expect(parseSongFromTable(undefined)).toBeNull();
  expect(parseSongFromTable("")).toBeNull();
  expect(parseSongFromTable("<td class=\"c\">only one cell</td>")).toBeNull();
});

test("parses a full search page with total pages", () => {
  const html = `
    <br>There are 412 results on 21 pages
    <table>
      <tr class="list_tr1" id="r1">${songRow(1, "ABBA", "Waterloo", "English")}</tr>
      <tr class="list_tr2" id="r2">${songRow(2, "Toto", "Africa", "English")}</tr>
    </table>`;
  const page = parseSongsFromSearch(html);
  expect(page.totalPages).toBe(21);
  expect(page.songs).toHaveLength(2);
  expect(page.songs[0]?.apiId).toBe(1);
  expect(page.songs[1]?.title).toBe("Africa");
});

test("returns totalPages 0 when summary line is missing", () => {
  expect(parseSongsFromSearch("<table></table>").totalPages).toBe(0);
});

test("buildFormBody includes filters only when set", () => {
  const base = buildFormBody({});
  expect(base.get("order")).toBe("lastchange");
  expect(base.get("ud")).toBe("desc");
  expect(base.get("language")).toBeNull();
  expect(base.get("genre")).toBeNull();
  expect(base.get("year")).toBeNull();

  const filtered = buildFormBody({
    language: "German",
    genre: "Pop",
    year: 1999,
    order: "year",
    ud: "asc",
  });
  expect(filtered.get("language")).toBe("German");
  expect(filtered.get("genre")).toBe("Pop");
  expect(filtered.get("year")).toBe("1999");
  expect(filtered.get("order")).toBe("year");
  expect(filtered.get("ud")).toBe("asc");
});
