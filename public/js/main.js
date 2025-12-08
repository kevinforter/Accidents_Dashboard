// main.js

let allAccidentData = [];      // alle Unfalldaten aus faelle.dsv
let yearRange = { min: null, max: null, from: null, to: null };
let selectedCantons = [];      // aktuell ausgewählte Kantone (Codes)
let mapMode = "unfall";        // "unfall" = kanton_unfall, "wohnort" = kanton_wohnort
let availableYears = [];       // alle Jahre im Datensatz (kontinuierlich min..max)

const cantonNames = {
    "ZH": "Zürich", "BE": "Bern", "LU": "Luzern", "UR": "Uri", "SZ": "Schwyz",
    "OW": "Obwalden", "NW": "Nidwalden", "GL": "Glarus", "ZG": "Zug", "FR": "Freiburg",
    "SO": "Solothurn", "BS": "Basel-Stadt", "BL": "Basel-Landschaft", "SH": "Schaffhausen",
    "AR": "Appenzell Ausserrhoden", "AI": "Appenzell Innerrhoden", "SG": "St. Gallen",
    "GR": "Graubünden", "AG": "Aargau", "TG": "Thurgau", "TI": "Tessin", "VD": "Waadt",
    "VS": "Wallis", "NE": "Neuenburg", "GE": "Genf", "JU": "Jura"
};

document.addEventListener("DOMContentLoaded", () => {
    if (document.body.classList.contains("page-viz")) {
        initVisualizationPage();
    }
});

function initVisualizationPage() {
    if (typeof loadAccidentData !== "function") {
        console.error("loadAccidentData ist nicht definiert (utils.js geladen?)");
        return;
    }

    loadAccidentData()
        .then(data => {
            // "Unbekannte oder übrige Tätigkeit" und "NA" (Altersgruppe) global herausfiltern
            allAccidentData = data.filter(d => 
                d.taetigkeit !== "Unbekannte oder übrige Tätigkeit" && 
                d.altersgruppe !== "NA"
            );

            // Jahr-Min/Max bestimmen
            const years = allAccidentData
                .map(d => d.jahr)
                .filter(y => !isNaN(y));
            const extent = d3.extent(years);
            yearRange.min = extent[0];
            yearRange.max = extent[1];
            yearRange.from = yearRange.min;
            yearRange.to = yearRange.max;
            availableYears = d3.range(yearRange.min, yearRange.max + 1);

            // Slider in die Karten-Controls einfügen
            insertYearSlider(yearRange.min, yearRange.max);

            // Altersgruppen-Auswahl dynamisch aus den Daten befüllen
            populateAgeOptions(allAccidentData);

            // Kantons-Auswahl befüllen
            populateCantonOptions();

            // Geschlecht-Auswahl befüllen
            populateGenderOptions(allAccidentData);

            // Tätigkeit-Auswahl befüllen
            populateActivityOptions(allAccidentData);

            // Event-Listener für Filter & Modal setzen

            // Event-Listener für Filter & Modal setzen
            wireFilterEvents();
            wireFilterModal();

            // Erstmalige Darstellung
            applyFiltersAndRender();
        })
        .catch(err => {
            console.error("Fehler beim Initialisieren der Visualisierung:", err);
        });
}

/* ---------------------------------------------------------
   Jahr-Slider in die card-controls der Karte einfügen
--------------------------------------------------------- */
function insertYearSlider(minYear, maxYear) {
    const controls =
        document.querySelector("#filter-controls") ||
        document.querySelector("#viz-map .card-controls");
    if (!controls) {
        console.warn("card-controls für #viz-map nicht gefunden.");
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "year-slider-box";

    const years = availableYears.length > 0
        ? availableYears
        : Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

    const yearOptionsStart = years
        .map(y => `<option value="${y}"${y === minYear ? " selected" : ""}>${y}</option>`)
        .join("");
    const yearOptionsEnd = years
        .map(y => `<option value="${y}"${y === maxYear ? " selected" : ""}>${y}</option>`)
        .join("");

    wrapper.innerHTML = `
      <label class="year-slider-label">
        Jahrspanne
        <span id="year-label">${minYear} – ${maxYear}</span>
      </label>
      <div class="year-range-inputs">
        <div class="year-input">
          <span>Von</span>
          <select id="year-start">
            ${yearOptionsStart}
          </select>
        </div>
        <div class="year-input">
          <span>Bis</span>
          <select id="year-end">
            ${yearOptionsEnd}
          </select>
        </div>
      </div>
    `;

    controls.appendChild(wrapper);
}

function populateCantonOptions() {
    const select = document.getElementById("filter-canton");
    if (!select) return;

    // Bestehende Optionen (bis auf "Alle") löschen?
    // Hier bauen wir einfach neu auf.
    select.innerHTML = '<option value="all">Alle Kantone</option>';

    // Sortiert nach Namen
    const sortedCodes = Object.keys(cantonNames).sort((a, b) =>
        cantonNames[a].localeCompare(cantonNames[b])
    );

    sortedCodes.forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = cantonNames[code];
        select.appendChild(opt);
    });
}

/* ---------------------------------------------------------
   Altersgruppen-Select befüllen
--------------------------------------------------------- */
function populateAgeOptions(data) {
    const selectAge = document.getElementById("filter-age");
    if (!selectAge) return;

    const uniqueAges = Array.from(
        new Set(
            data
                .map(d => d.altersgruppe)
                .filter(Boolean)
        )
    );

    const parseAgeStart = val => {
        const match = /^(\d+)/.exec(val);
        return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
    };

    uniqueAges.sort((a, b) => {
        const diff = parseAgeStart(a) - parseAgeStart(b);
        return diff !== 0 ? diff : a.localeCompare(b);
    });

    selectAge.innerHTML = "";

    const optionAll = document.createElement("option");
    optionAll.value = "all";
    optionAll.textContent = "Alle Altersgruppen";
    selectAge.appendChild(optionAll);

    uniqueAges.forEach(age => {
        const opt = document.createElement("option");
        opt.value = age;
        opt.textContent = age;
        selectAge.appendChild(opt);
    });
}

/* ---------------------------------------------------------
   Geschlecht-Select befüllen
--------------------------------------------------------- */
function populateGenderOptions(data) {
    const selectGender = document.getElementById("filter-gender");
    if (!selectGender) return;

    const uniqueGenders = Array.from(
        new Set(
            data
                .map(d => d.geschlecht)
                .filter(Boolean)
        )
    );
    uniqueGenders.sort();

    selectGender.innerHTML = "";
    const optionAll = document.createElement("option");
    optionAll.value = "all";
    optionAll.textContent = "Alle Geschlechter";
    selectGender.appendChild(optionAll);

    uniqueGenders.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        // Label etwas schöner machen
        if (g === "m") opt.textContent = "Männlich";
        else if (g === "f") opt.textContent = "Weiblich";
        else opt.textContent = g;
        selectGender.appendChild(opt);
    });
}

/* ---------------------------------------------------------
   Tätigkeit-Select befüllen
--------------------------------------------------------- */
function populateActivityOptions(data) {
    const selectActivity = document.getElementById("filter-activity");
    if (!selectActivity) return;

    const uniqueActivities = Array.from(
        new Set(
            data
                .map(d => d.taetigkeit)
                .filter(Boolean)
        )
    );
    // Alphabetisch sortieren
    uniqueActivities.sort((a, b) => a.localeCompare(b));

    selectActivity.innerHTML = "";
    const optionAll = document.createElement("option");
    optionAll.value = "all";
    optionAll.textContent = "Alle Tätigkeiten";
    selectActivity.appendChild(optionAll);

    uniqueActivities.forEach(act => {
        const opt = document.createElement("option");
        opt.value = act;
        opt.textContent = act;
        selectActivity.appendChild(opt);
    });
}

/* ---------------------------------------------------------
   Filter-Events (Reset, Dropdowns, Jahr-Slider)
--------------------------------------------------------- */
function wireFilterEvents() {
    const btnReset    = document.getElementById("btn-reset");
    const selectBranch = document.getElementById("filter-branch");
    const selectAge   = document.getElementById("filter-age");
    const selectCanton = document.getElementById("filter-canton");
    const yearStart   = document.getElementById("year-start");
    const yearEnd     = document.getElementById("year-end");
    const yearLabel   = document.getElementById("year-label");
    const modeRadios  = document.querySelectorAll('input[name="map-mode"]');

    // Reset-Button
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            // Versicherungszweig & Altersgruppe zurücksetzen
            if (selectBranch) selectBranch.value = "all";
            if (selectAge) selectAge.value = "all";
            if (selectCanton) selectCanton.value = "all";

            // Jahr-Slider zurück auf min/max
            if (yearStart && yearEnd) {
                yearStart.value = yearRange.min;
                updateYearEndOptions(yearRange.min);
                yearEnd.value   = yearRange.max;
                yearRange.from  = yearRange.min;
                yearRange.to    = yearRange.max;
                if (yearLabel) {
                    yearLabel.textContent = `${yearRange.min} – ${yearRange.max}`;
                }
            }

            // Neue Filter zurücksetzen
            const selectGender = document.getElementById("filter-gender");
            const selectActivity = document.getElementById("filter-activity");
            if (selectGender) selectGender.value = "all";
            if (selectActivity) selectActivity.value = "all";

            // Kantonsauswahl zurücksetzen (global und für Karte)
            selectedCantons = [];
            if (window.selectedCantons) {
                window.selectedCantons.length = 0; // gleiche Array-Referenz leeren
            }

            // Kartenmodus zurücksetzen
            const defaultMode = document.querySelector('input[name="map-mode"][value="unfall"]');
            if (defaultMode) {
                defaultMode.checked = true;
                mapMode = "unfall";
            }

            applyFiltersAndRender();
        });
    }

    // Versicherungszweig-Filter
    if (selectBranch) {
        selectBranch.addEventListener("change", () => {
            applyFiltersAndRender();
        });
    }

    // Altersgruppen-Filter (falls du Optionen ergänzt)
    if (selectAge) {
        selectAge.addEventListener("change", () => {
            applyFiltersAndRender();
        });
    }

    // Geschlecht-Filter
    const selectGender = document.getElementById("filter-gender");
    if (selectGender) {
        selectGender.addEventListener("change", () => {
            applyFiltersAndRender();
        });
    }

    // Tätigkeit-Filter
    const selectActivity = document.getElementById("filter-activity");
    if (selectActivity) {
        selectActivity.addEventListener("change", () => {
            applyFiltersAndRender();
        });
    }

    // Kantons-Filter (Dropdown)
    if (selectCanton) {
        selectCanton.addEventListener("change", () => {
            const val = selectCanton.value;
            if (val === "all") {
                selectedCantons = [];
            } else {
                selectedCantons = [val];
            }
            // Sync mit globaler Variable für chart_map (falls nötig)
            window.selectedCantons = selectedCantons;
            applyFiltersAndRender();
        });
    }

    // Kartenmodus (Unfallort/Wohnort)
    if (modeRadios && modeRadios.length > 0) {
        const checked = document.querySelector('input[name="map-mode"]:checked');
        if (checked) {
            mapMode = checked.value;
        }

        modeRadios.forEach(radio => {
            radio.addEventListener("change", () => {
                mapMode = radio.value;
                applyFiltersAndRender();
            });
        });
    }

    // Jahr-Slider: Start
    if (yearStart && yearEnd && yearLabel) {
        yearStart.addEventListener("change", () => {
            let startVal = +yearStart.value;
            let endVal   = +yearEnd.value;

            updateYearEndOptions(startVal);
            endVal = +yearEnd.value; // might have been adjusted

            if (startVal > endVal) {
                startVal = endVal;
                yearStart.value = startVal;
            }

            yearRange.from = startVal;
            yearRange.to   = endVal;
            yearLabel.textContent = `${yearRange.from} – ${yearRange.to}`;

            applyFiltersAndRender();
        });

        // Jahr-Ende
        yearEnd.addEventListener("change", () => {
            let startVal = +yearStart.value;
            let endVal   = +yearEnd.value;

            if (endVal < startVal) {
                endVal = startVal;
                yearEnd.value = endVal;
            }

            yearRange.from = startVal;
            yearRange.to   = endVal;
            yearLabel.textContent = `${yearRange.from} – ${yearRange.to}`;

            applyFiltersAndRender();
        });
    }
}

/* ---------------------------------------------------------
   Zentrale Filterlogik + Rendering
--------------------------------------------------------- */
function applyFiltersAndRender() {
    if (!allAccidentData || allAccidentData.length === 0) return;

    const selectBranch = document.getElementById("filter-branch");
    const selectAge    = document.getElementById("filter-age");

    let branch = "all";
    let age    = "all";

    if (selectBranch) branch = selectBranch.value || "all";
    if (selectAge)    age    = selectAge.value || "all";

    const cantonField = mapMode === "wohnort" ? "kanton_wohnort" : "kanton_unfall";

    let fromYear = yearRange.from ?? yearRange.min;
    let toYear   = yearRange.to   ?? yearRange.max;

    // 1. Jahr filtern
    let data = allAccidentData.filter(d =>
        d.jahr >= fromYear && d.jahr <= toYear
    );

    // 2. Versicherungszweig (BU/NBU)
    if (branch !== "all") {
        data = data.filter(d => d.zweig === branch);
    }

    // 3. Altersgruppe
    if (age !== "all") {
        data = data.filter(d => d.altersgruppe === age);
    }

    // 3b. Geschlecht
    const selectGender = document.getElementById("filter-gender");
    if (selectGender && selectGender.value !== "all") {
        data = data.filter(d => d.geschlecht === selectGender.value);
    }

    // 3c. Tätigkeit
    const selectActivity = document.getElementById("filter-activity");
    if (selectActivity && selectActivity.value !== "all") {
        data = data.filter(d => d.taetigkeit === selectActivity.value);
    }

    // 4. Kanton-Auswahl (von der Karte)
    if (selectedCantons.length > 0) {
        data = data.filter(d => selectedCantons.includes(d[cantonField]));
    }

    // Für die Karten-/Chart-Berechnung den passenden Kantonscode bereitstellen
    const mappedData = data.map(d => ({
        ...d,
        kanton: d[cantonField] || ""
    }));

    // Karte updaten
    if (typeof renderMap === "function") {
        try {
            renderMap(mappedData);
        } catch (e) {
            console.error("Fehler in renderMap:", e);
        }
    }

    // Trend-Chart updaten
    if (typeof renderTrendChart === "function") {
        try {
            renderTrendChart(mappedData);
        } catch (e) {
            console.error("Fehler in renderTrendChart:", e);
        }
    }

    // Balkendiagramm updaten
    if (typeof renderBarChart === "function") {
        try {
            renderBarChart(mappedData);
        } catch (e) {
            console.error("Fehler in renderBarChart:", e);
        }
    }
}

/* ---------------------------------------------------------
   Callback aus chart_map.js, wenn Kantone angeklickt wurden
--------------------------------------------------------- */
window.updateChartsFromMap = function(cantons) {
    selectedCantons = cantons.slice();  // lokale Kopie
    window.selectedCantons = selectedCantons; // Global sync

    // Dropdown updaten
    const selectCanton = document.getElementById("filter-canton");
    if (selectCanton) {
        if (selectedCantons.length === 0) {
            selectCanton.value = "all";
        } else if (selectedCantons.length === 1) {
            selectCanton.value = selectedCantons[0];
        } else {
            // Bei Mehrfachauswahl: Dropdown kann das nicht nativ anzeigen -> "all" oder so lassen
            // Optional: Man könnte eine "Multiple" Option einfügen, aber "all" ist weniger verwirrend als ein falscher Einzelwert.
            selectCanton.value = "all";
        }
    }

    applyFiltersAndRender();
};

/* ---------------------------------------------------------
   Filter-Modal öffnen/schließen
--------------------------------------------------------- */
function wireFilterModal() {
    const openBtn = document.getElementById("btn-open-filters");
    const closeBtn = document.getElementById("filter-close");
    const modal = document.getElementById("filter-modal");
    const backdrop = document.getElementById("filter-backdrop");

    const open = () => {
        modal?.classList.add("open");
        backdrop?.classList.add("open");
        document.body.classList.add("modal-open");
    };
    const close = () => {
        modal?.classList.remove("open");
        backdrop?.classList.remove("open");
        document.body.classList.remove("modal-open");
    };

    if (openBtn && modal && backdrop) {
        openBtn.addEventListener("click", open);
    }
    if (closeBtn) {
        closeBtn.addEventListener("click", close);
    }
    if (backdrop) {
        backdrop.addEventListener("click", close);
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") close();
    });
}

/* ---------------------------------------------------------
   Jahr-Selects synchronisieren (Ende >= Start)
--------------------------------------------------------- */
function updateYearEndOptions(minYearForEnd) {
    const selectEnd = document.getElementById("year-end");
    if (!selectEnd) return;

    const options = availableYears
        .filter(y => y >= minYearForEnd)
        .map(y => `<option value="${y}">${y}</option>`)
        .join("");

    const previous = +selectEnd.value;
    selectEnd.innerHTML = options;

    const validValues = availableYears.filter(y => y >= minYearForEnd);
    const newValue = validValues.includes(previous) ? previous : validValues[0];
    selectEnd.value = newValue;
}
