// main.js

let allAccidentData = [];      // alle Unfalldaten aus faelle.dsv
let yearRange = { min: 2011, max: 2023, from: 2011, to: 2023 };
let selectedCantons = [];      // aktuell ausgewählte Kantone (Codes)
let mapMode = "unfall";        // "unfall" = kanton_unfall, "wohnort" = kanton_wohnort
let availableYears = [];

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

            // Daten sortieren nach Jahr (optional)
            allAccidentData.sort((a, b) => a.jahr - b.jahr);
            
            // Jahr-Range ermitteln
            const years = allAccidentData.map(d => d.jahr);
            const minYear = d3.min(years);
            const maxYear = d3.max(years);
            
            availableYears = Array.from(new Set(years)).sort((a, b) => a - b);

            yearRange.min = minYear;
            yearRange.max = maxYear;
            yearRange.from = minYear;
            yearRange.to = maxYear;

            // Dropdowns befüllen
            populateYearOptions(yearRange.min, yearRange.max);

    // Altersgruppen-Auswahl dynamisch aus den Daten befüllen
    if (yearStart) {
        yearStart.addEventListener("change", () => {
            let val = +yearStart.value;
            if (val > yearRange.to) {
                yearRange.to = val;
                yearEnd.value = val;
            }
            yearRange.from = val;
            updateYearEndOptions(val); 
            applyFiltersAndRender();
        });
    }

    if (yearEnd) {
        yearEnd.addEventListener("change", () => {
            let val = +yearEnd.value;
            if (val < yearRange.from) {
                yearRange.from = val;
                yearStart.value = val;
            }
            yearRange.to = val;
            applyFiltersAndRender();
        });
    }

            // Altersgruppen-Auswahl dynamisch aus den Daten befüllen
            populateAgeOptions(allAccidentData);

            // Kantons-Auswahl befüllen (initial)
            updateCantonOptionsBasedOnActivity();

            // Geschlecht-Auswahl befüllen
            populateGenderOptions(allAccidentData);

            // Tätigkeit-Auswahl befüllen (initial basierend auf "alle Kantone")
            updateActivityOptionsBasedOnCanton();

            // Event-Listener für Filter & Modal setzen
            wireFilterEvents();
            // wireFilterModal removed

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
// insertYearSlider removed

/* ---------------------------------------------------------
   Jahre-Dropdowns befüllen
--------------------------------------------------------- */
function populateYearOptions(min, max) {
    const yearStart = document.getElementById("year-start");
    const yearEnd = document.getElementById("year-end");
    if (!yearStart || !yearEnd) return;

    // Optionen generieren
    // availableYears global nutzen oder neu generieren range(min, max)
    const options = availableYears.map(y => `<option value="${y}">${y}</option>`).join("");
    
    yearStart.innerHTML = options;
    yearEnd.innerHTML = options;

    // Auswahl setzen
    yearStart.value = yearRange.from;
    yearEnd.value = yearRange.to;
}

function populateCantonOptions(data) {
    const select = document.getElementById("filter-canton");
    if (!select) return;

    // Aktuellen Wert merken, um ihn nach Möglichkeit wiederherzustellen
    const currentValue = select.value;

    select.innerHTML = '<option value="all">Alle Kantone</option>';

    // Wenn Daten übergeben wurden, nur Kantone anzeigen, die darin vorkommen
    let relevantCodes = Object.keys(cantonNames);
    if (data) {
        const cantonField = mapMode === "wohnort" ? "kanton_wohnort" : "kanton_unfall";
        const codesInDataset = new Set(data.map(d => d[cantonField]));
        relevantCodes = relevantCodes.filter(c => codesInDataset.has(c));
    }

    // Sortiert nach Namen
    relevantCodes.sort((a, b) =>
        cantonNames[a].localeCompare(cantonNames[b])
    );

    relevantCodes.forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = cantonNames[code];
        select.appendChild(opt);
    });

    // Wert wiederherstellen, falls noch vorhanden
    if (currentValue && (currentValue === "all" || relevantCodes.includes(currentValue))) {
        select.value = currentValue;
    } else {
        select.value = "all";
        // Falls der Wert weggefallen ist, müssen wir auch die globale Auswahl resetten
        if (currentValue !== "all") {
             selectedCantons = [];
             window.selectedCantons = [];
        }
    }
}

/* ---------------------------------------------------------
   Hilfsfunktion: Kanton-Optionen basierend auf Tätigkeit filtern
--------------------------------------------------------- */
function updateCantonOptionsBasedOnActivity() {
    const selectActivity = document.getElementById("filter-activity");
    if (!selectActivity) return;

    const currentActivity = selectActivity.value;
    
    if (currentActivity === "all") {
        // Alle Kantone anzeigen (basierend auf allen Daten)
        populateCantonOptions(allAccidentData);
    } else {
        // Nur Kantone anzeigen, die diese Tätigkeit haben
        const relevantData = allAccidentData.filter(d => d.taetigkeit === currentActivity);
        populateCantonOptions(relevantData);
    }
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
   Jahr-Optionen befüllen
--------------------------------------------------------- */
function populateYearOptions(minYear, maxYear) {
    const yearStartSelect = document.getElementById("year-start");
    const yearEndSelect = document.getElementById("year-end");
    
    // Check if elements exist (modal might not interpret them if HTML missing, but I restored HTML)
    if (!yearStartSelect || !yearEndSelect) return;

    // Clear
    yearStartSelect.innerHTML = "";
    yearEndSelect.innerHTML = "";

    // Populate
    for (let y = minYear; y <= maxYear; y++) {
        const optS = document.createElement("option");
        optS.value = y;
        optS.textContent = y;
        yearStartSelect.appendChild(optS);

        const optE = document.createElement("option");
        optE.value = y;
        optE.textContent = y;
        yearEndSelect.appendChild(optE);
    }

    // Set initial values
    yearStartSelect.value = yearRange.from;
    yearEndSelect.value = yearRange.to;

    // Update End Options logic
    updateYearEndOptions(yearRange.from);
}

function updateYearEndOptions(startYear) {
    const yearEndSelect = document.getElementById("year-end");
    if (!yearEndSelect) return;

    const currentEnd = parseInt(yearEndSelect.value, 10);
    
    // Disable options < startYear
    Array.from(yearEndSelect.options).forEach(opt => {
        const val = parseInt(opt.value, 10);
        if (val < startYear) {
            opt.disabled = true;
        } else {
            opt.disabled = false;
        }
    });

    // If current selection is invalid, reset to startYear or max
    if (currentEnd < startYear) {
        yearEndSelect.value = startYear;
    }
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
   Helper: Click-State zurücksetzen
--------------------------------------------------------- */
function resetClickState() {
    clickedActivity = null;
    clickedGender = null;
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
            // Click-State resetten
            resetClickState();

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

            // Tätigkeit-Optionen aktualisieren (wieder alle anzeigen)
            updateActivityOptionsBasedOnCanton();
            // Kantons-Optionen aktualisieren (wieder alle anzeigen)
            updateCantonOptionsBasedOnActivity();

            applyFiltersAndRender();
        });
    }

    // Versicherungszweig-Filter
    if (selectBranch) {
        selectBranch.addEventListener("change", () => {
            resetClickState();
            applyFiltersAndRender();
        });
    }

    // Altersgruppen-Filter (falls du Optionen ergänzt)
    if (selectAge) {
        selectAge.addEventListener("change", () => {
            resetClickState();
            applyFiltersAndRender();
        });
    }

    // Geschlecht-Filter
    const selectGender = document.getElementById("filter-gender");
    if (selectGender) {
        selectGender.addEventListener("change", () => {
            resetClickState();
            applyFiltersAndRender();
        });
    }

    // Tätigkeit-Filter
    const selectActivity = document.getElementById("filter-activity");
    if (selectActivity) {
        selectActivity.addEventListener("change", () => {
            resetClickState();
            updateCantonOptionsBasedOnActivity();
            applyFiltersAndRender();
        });
    }

    // Kantons-Filter (Dropdown)
    if (selectCanton) {
        selectCanton.addEventListener("change", () => {
            resetClickState();
            const val = selectCanton.value;
            if (val === "all") {
                selectedCantons = [];
            } else {
                selectedCantons = [val];
            }
            // Sync mit globaler Variable für chart_map (falls nötig)
            window.selectedCantons = selectedCantons;
            
            // Tätigkeit-Optionen aktualisieren
            updateActivityOptionsBasedOnCanton();

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
                resetClickState();
                mapMode = radio.value;
                updateActivityOptionsBasedOnCanton();
                applyFiltersAndRender();
            });
        });
    }

}

/* ---------------------------------------------------------
   Zentrale Filterlogik + Rendering
--------------------------------------------------------- */
// State for "Click Linking" (Soft Filter)
let clickedActivity = null;
let clickedGender = null;

window.toggleActivityFilter = function(activity) {
    // Toggle clicked state
    if (clickedActivity === activity) {
        clickedActivity = null;
    } else {
        clickedActivity = activity;
    }
    
    // Trigger update
    // updateCantonOptionsBasedOnActivity(); // Optional: decide if click should filter cantons
    applyFiltersAndRender();
};

window.toggleGenderFilter = function(gender) {
    // Toggle clicked state
    if (clickedGender === gender) {
        clickedGender = null;
    } else {
        clickedGender = gender;
    }

    // Trigger update
    applyFiltersAndRender();
};

window.getClickedActivity = function() {
    return clickedActivity;
};

window.getClickedGender = function() {
    return clickedGender;
};

window.getSelectedActivity = function() {
    const select = document.getElementById("filter-activity");
    return select ? select.value : "all";
};

window.getSelectedGender = function() {
    const select = document.getElementById("filter-gender");
    return select ? select.value : "all";
};

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

    let fromYear = 2011; // Default min
    let toYear   = 2023; // Default max (Hardcoded or potentially derived if needed, but year filter is gone)
    // Ideally we just don't filter by year range anymore unless we want to keep the full range "implicit"

    // 1. Basis-Daten filtern (Hard Filters: Zweig, Alter, Kanton, Dropdowns)
    let baseData = allAccidentData; 

    // Apply Year Filter
    if (yearRange) {
        baseData = baseData.filter(d => d.jahr >= yearRange.from && d.jahr <= yearRange.to);
    }

    if (branch !== "all") {
        baseData = baseData.filter(d => d.zweig === branch);
    }

    if (age !== "all") {
        baseData = baseData.filter(d => d.altersgruppe === age);
    }

    if (selectedCantons.length > 0) {
        baseData = baseData.filter(d => selectedCantons.includes(d[cantonField]));
    }

    // Dropdown Filters (Hard Filters)
    const selectedActivity = window.getSelectedActivity();
    const selectedGender = window.getSelectedGender();

    if (selectedActivity !== "all") {
        baseData = baseData.filter(d => d.taetigkeit === selectedActivity);
    }
    if (selectedGender !== "all") {
        baseData = baseData.filter(d => d.geschlecht === selectedGender);
    }

    // 2. Click Filters (Soft Filters)
    // These apply on top of baseData for specific charts
    
    // 3. Daten für die Karte (Voll gefiltert: Hard + Soft)
    let mapData = baseData;
    if (clickedActivity) {
        mapData = mapData.filter(d => d.taetigkeit === clickedActivity);
    }
    if (clickedGender) {
        mapData = mapData.filter(d => d.geschlecht === clickedGender);
    }

    // 4. Daten für Trend-Chart (Activity)
    // Hard Filters applied.
    // Soft Filters: Apply Gender click, IGNORE Activity click (Context)
    let trendData = baseData;
    if (clickedGender) {
        trendData = trendData.filter(d => d.geschlecht === clickedGender);
    }

    // 5. Daten für Donut-Chart (Gender)
    // Hard Filters applied.
    // Soft Filters: Apply Activity click, IGNORE Gender click (Context)
    let barData = baseData;
    if (clickedActivity) {
        barData = barData.filter(d => d.taetigkeit === clickedActivity);
    }



    // 6. Daten für Timeline (Alle Filter AUSSER Jahr - which is now all of them since year filter is gone)
    // Since year filter is gone, timelineData is basically the same logic as other charts,
    // but maybe we still want to show the context of "all years" vs "filtered by other things".
    // Actually, normally timeline shows evolution over time. If we filter by specific criteria, timeline should reflect that subset.
    
    let timelineData = allAccidentData;

    // Apply Branch Filter
    if (branch !== "all") {
        timelineData = timelineData.filter(d => d.zweig === branch);
    }
    // Apply Age Filter
    if (age !== "all") {
        timelineData = timelineData.filter(d => d.altersgruppe === age);
    }
    // Apply Canton Filter
    if (selectedCantons.length > 0) {
        timelineData = timelineData.filter(d => selectedCantons.includes(d[cantonField]));
    }
    // Apply Dropdown Filters
    if (selectedActivity !== "all") {
        timelineData = timelineData.filter(d => d.taetigkeit === selectedActivity);
    }
    if (selectedGender !== "all") {
        timelineData = timelineData.filter(d => d.geschlecht === selectedGender);
    }
    // Apply Click Filters (Soft)
    if (clickedActivity) {
        timelineData = timelineData.filter(d => d.taetigkeit === clickedActivity);
    }
    if (clickedGender) {
        timelineData = timelineData.filter(d => d.geschlecht === clickedGender);
    }

    // Helper: Kantonscode anfügen für Map
    const mapDataWithCanton = mapData.map(d => ({ ...d, kanton: d[cantonField] || "" }));
    const trendDataWithCanton = trendData.map(d => ({ ...d, kanton: d[cantonField] || "" }));
    const barDataWithCanton = barData.map(d => ({ ...d, kanton: d[cantonField] || "" }));

    // Karte updaten
    if (typeof renderMap === "function") {
        try {
            renderMap(mapDataWithCanton);
        } catch (e) {
            console.error("Fehler in renderMap:", e);
        }
    }

    // Trend-Chart updaten
    if (typeof renderTrendChart === "function") {
        try {
            renderTrendChart(trendDataWithCanton);
        } catch (e) {
            console.error("Fehler in renderTrendChart:", e);
        }
    }

    // Balkendiagramm updaten (Donut)
    if (typeof renderBarChart === "function") {
        try {
            renderBarChart(barDataWithCanton);
        } catch (e) {
            console.error("Fehler in renderBarChart:", e);
        }
    }

    // Timeline updaten
    if (typeof renderTimeline === "function") {
        try {
            // Pass full year range since functionality is removed from UI
            renderTimeline(timelineData, yearRange); 
        } catch (e) {
            console.error("Fehler in renderTimeline:", e);
        }
    }
}

// updateYearRangeFromBrush removed

/* ---------------------------------------------------------
   Callback aus chart_timeline.js (Brushing)
--------------------------------------------------------- */
window.updateYearRangeFromBrush = function(startYear, endYear) {
    // Validierung
    if (startYear < yearRange.min) startYear = yearRange.min;
    if (endYear > yearRange.max) endYear = yearRange.max;
    if (startYear > endYear) startYear = endYear;

    // State update
    yearRange.from = startYear;
    yearRange.to = endYear;

    // UI Update (Dropdowns & Label)
    const yearStart = document.getElementById("year-start");
    const yearEnd = document.getElementById("year-end");
    const yearLabel = document.getElementById("year-label");

    if (yearStart) yearStart.value = startYear;
    if (yearEnd) {
        updateYearEndOptions(startYear); // Optionen anpassen
        yearEnd.value = endYear;
    }
    if (yearLabel) {
        yearLabel.textContent = `${startYear} – ${endYear}`;
    }

    // Render (aber Timeline nicht komplett neu zeichnen, sonst flackert der Brush? 
    // D3 Brush handles move events well, but if we re-render the whole chart, the brush might reset or jump.
    // renderTimeline checks if selection is provided.
    applyFiltersAndRender();
};

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

    // Tätigkeit-Optionen aktualisieren
    updateActivityOptionsBasedOnCanton();

    applyFiltersAndRender();
};

/* ---------------------------------------------------------
   Hilfsfunktion: Tätigkeit-Optionen basierend auf Kanton filtern
--------------------------------------------------------- */
function updateActivityOptionsBasedOnCanton() {
    const selectActivity = document.getElementById("filter-activity");
    if (!selectActivity) return;

    const currentActivity = selectActivity.value;
    const cantonField = mapMode === "wohnort" ? "kanton_wohnort" : "kanton_unfall";

    let relevantData = allAccidentData;
    if (selectedCantons.length > 0) {
        relevantData = relevantData.filter(d => selectedCantons.includes(d[cantonField]));
    }

    populateActivityOptions(relevantData);

    // Versuchen, die alte Auswahl wiederherzustellen
    // Wenn der Wert nicht existiert, fällt der Browser oft auf den ersten zurück ("all")
    // Sicherheitshalber prüfen wir, ob wir ihn setzen können.
    // Da populateActivityOptions den DOM neu baut, ist der alte Value weg.
    // Wir setzen ihn neu. Wenn er nicht in den options ist, wird er ignoriert (oder leer).
    // Wir wollen "all" als Fallback.
    
    // Prüfen ob currentActivity in relevantData vorkommt (außer es ist "all")
    let exists = true;
    if (currentActivity !== "all") {
        exists = relevantData.some(d => d.taetigkeit === currentActivity);
    }

    if (exists) {
        selectActivity.value = currentActivity;
    } else {
        selectActivity.value = "all";
    }
}

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


