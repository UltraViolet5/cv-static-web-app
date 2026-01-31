# CV – Azure Static Web App

Ten projekt to statyczna strona z CV (HTML/CSS) gotowa do wdrożenia w **Azure Static Web Apps**.

## Szybki start
1. Utwórz nowe repozytorium na GitHub i wgraj pliki (gałąź `main`).
2. W Azure utwórz zasób **Static Web App** i połącz z repozytorium.
3. Ustaw `App location` na `/`, `Api location` puste, `Output location` na `/`.
4. Po linkowaniu Azure sam doda workflow; alternatywnie użyj dołączonego `.github/workflows/azure-static-web-app.yml`.
5. Po pushu nastąpi automatyczne wdrożenie.

## Struktura
- `index.html` – treść CV
- `styles.css` – styl
- `assets/favicon.svg` – ikona
- `routes.json` – przekierowania
- `.github/workflows/azure-static-web-app.yml` – CI/CD do SWA

## Lokalny podgląd
Otwórz `index.html` w przeglądarce.
