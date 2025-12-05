const DATA_URL = "data/faelle.dsv";

let accidentData = null;

// Lädt die Unfalldaten einmal und cached sie
function loadAccidentData() {
    if (accidentData) {
        return Promise.resolve(accidentData);
    }

    // WICHTIG: Trenner ist ';' und Spaltennamen sind klein
    return d3.dsv(";", DATA_URL, d => {
        const jahr = +d.registrierungsjahr;

        const kantonUnfall = (d.kanton_unfall || "").trim().toUpperCase();    // ZH, LU, BE, ...
        const kantonWohnort = (d.kanton_wohnort || "").trim().toUpperCase();  // ZH, LU, BE, ...

        const zweig = (d.versicherungszweig || "").trim();
        const altersgruppe = (d.altersgruppe || "").trim();
        const geschlecht = (d.geschlecht || "").trim().toLowerCase();
        const taetigkeit = (d.taetigkeit || "").trim();
        const anzahl = +d.anzahl_unfaelle;

        return {
            jahr,
            kanton: kantonUnfall, // Standard: Unfallort
            kanton_unfall: kantonUnfall,
            kanton_wohnort: kantonWohnort,
            zweig,
            altersgruppe,
            geschlecht,
            taetigkeit,
            anzahl: isNaN(anzahl) ? 0 : anzahl
        };
    })
        .then(data => {
            accidentData = data;
            console.log("Unfalldaten geladen:", data.length, "Zeilen");
            return data;
        })
        .catch(err => {
            console.error("Fehler beim Laden der Unfalldaten:", err);
            throw err;
        });
}
