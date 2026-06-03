# Design: Eigenes App-Icon „Stern mit Schallwelle"

**Datum:** 2026-06-03
**Status:** Entwurf genehmigt (Variante C aus dem Visual-Companion-Vergleich)

## Motiv

Fünfzackiger Stern im Violett→Neon-Verlauf (`#e879ff → #cba6f7`) mit Glow über einer cyanfarbenen Schallwelle (`#89dceb`), auf dunkler abgerundeter Kachel (`#2a2a40 → #16161f`, Radius 56/256). Für kleine Größen (≤48px) eine vereinfachte Variante: kein Glow, nur eine Welle, kräftigere Konturen, helleres Violett (`#d98cf9`).

## Artefakte (alle versioniert unter `resources/`)

| Datei | Zweck |
|---|---|
| `resources/icon.svg` | Detail-Variante (Quelle für ≥64px) |
| `resources/icon-small.svg` | Vereinfachte Variante (Quelle für ≤48px) |
| `resources/generate-icon.ts` | Generator: rendert beide SVGs per Playwright/Chromium (transparenter Hintergrund, `omitBackground`) in PNGs und packt sie als PNG-embedded ICO |
| `resources/icon.ico` | Ergebnis (eingecheckt — Builds brauchen den Generator nicht) |

**ICO-Inhalt:** 16, 24, 32, 48 (aus icon-small.svg) und 64, 128, 256 (aus icon.svg); 256 mit Breite/Höhe-Byte 0 gemäß ICO-Format. PNG-embedded ICO ist ab Windows Vista gültig.

## Einbindung

- `electron-builder.yml`: `win.icon: resources/icon.ico` (bewusst nicht das Standard-`build/`-Verzeichnis — kollidiert mit dem CLI-Build-Output und ist gitignored). Der veraltete „ohne eigenes Icon"-Kommentar entfällt.
- `src/desktop/main/index.ts`: `icon: join(import.meta.dirname, "../../resources/icon.ico")` — Pfad funktioniert nur im Dev-Modus; in der gepackten App liefert die Exe das Icon selbst. Daher: Icon-Option nur setzen, wenn die Datei existiert (Dev), sonst weglassen. Einfachste robuste Form: `...(app.isPackaged ? {} : { icon: <devPfad> })`.
- Installer neu bauen; Asset im bestehenden GitHub-Release v1.2.0 ersetzen (`gh release upload v1.2.0 <exe> --clobber`). Version bleibt 1.2.0.

## Verifikation

- Generator-Lauf erzeugt `icon.ico` mit 7 Einträgen (Skript validiert Anzahl + Größen beim Schreiben).
- `bun run desktop:dist` → Exe/Installer tragen das Stern-Icon (Sichtprüfung im Explorer).
- Bestehende Gates bleiben grün (Tests, tsc, Lint, E2E).

## Bewusst nicht enthalten

- macOS-`.icns`/Linux-PNG-Sets (kommen mit den jeweiligen Builds).
- Neue Dependencies (ICO-Packing von Hand, ~40 Zeilen; Playwright ist bereits devDependency).
