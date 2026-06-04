import { expect, test } from "bun:test";
import { parseYoutubeLinks } from "./youtube.ts";

const DETAIL_HTML = `
<table border="0" width="500">
<tr class="list_head"><td>Comments by users (two cents)</td></tr>
<tr class="list_tr1"><td></td></tr>
<tr class="list_tr2"><td>13.12.23 - 04:07 | <a href="?link=profil&id=189527">Badut</a> <img src="images/neutral.png"></td></tr><tr class="list_tr1"><td>For Video:<br />
<br><center><br><iframe class="embed" width="432" height="240" src="https://www.youtube.com/embed/EAC-2ttHCyk"></iframe></center><br><br />
#VIDEOGAP:37.5<br><br></td></tr><tr class="list_tr2"><td>31.07.23 - 23:47 | <a href="?link=profil&id=149516">LilPeep1337</a> <img src="images/add.png"></td></tr><tr class="list_tr1"><td>nice!! vielen vielen dank! <img src="images/smilies/winking.png" title=";)"><br><br></td></tr><tr class="list_tr2"><td>19.02.23 - 14:00 | <b><a href="?link=profil&id=168937">BlodsveptKrigare</a></b> <img src="images/neutral.png"></td></tr><tr class="list_tr1"><td><br><center><br><iframe class="embed" width="432" height="240" src="https://www.youtube.com/embed/fpJ0VJGNXgY"></iframe></center><br><br><br></td></tr>
</table>`;

test("extracts videoGap from the same comment as the video link", () => {
  const links = parseYoutubeLinks(DETAIL_HTML);
  expect(links).toHaveLength(2);
  expect(links[0]?.link).toContain("EAC-2ttHCyk");
  expect(links[0]?.videoGap).toBe("37.5");
  expect(links[1]?.link).toContain("fpJ0VJGNXgY");
  expect(links[1]?.videoGap).toBeUndefined();
});

test("accepts comma decimal videogap", () => {
  const html = `<tr class="list_tr2"><td>01.01.24 - 10:00 | <a href="?x">User</a></td></tr><tr class="list_tr1"><td><iframe src="https://www.youtube.com/embed/abc12345678"></iframe> #VIDEOGAP: 12,25 </td></tr>`;
  const links = parseYoutubeLinks(html);
  expect(links[0]?.videoGap).toBe("12,25");
});
