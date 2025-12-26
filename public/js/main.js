// main.js

let allAccidentData = [];      // all accident data from faelle.dsv
let yearRange = { min: 2011, max: 2023, from: 2011, to: 2023 };
let selectedCantons = [];      // currently selected cantons (codes)
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
            // Filter out "Unknown or other activity" and "NA" age group globally
            allAccidentData = data.filter(d => 
                d.taetigkeit !== "Unbekannte oder übrige Tätigkeit" && 
                d.altersgruppe !== "NA"
            );

            // Sort data by year (optional)
            allAccidentData.sort((a, b) => a.jahr - b.jahr);
            
            // Determine Year Range
            const years = allAccidentData.map(d => d.jahr);
            const minYear = d3.min(years);
            const maxYear = d3.max(years);
            
            availableYears = Array.from(new Set(years)).sort((a, b) => a - b);

            yearRange.min = minYear;
            yearRange.max = maxYear;
            yearRange.from = minYear;
            yearRange.to = maxYear;

            // Populate Dropdowns
            populateYearOptions(yearRange.min, yearRange.max);

            // Populate Age Group Selection dynamically from data
            populateAgeOptions(allAccidentData);

            // Populate Canton Selection (initial)
            updateCantonOptionsBasedOnActivity();

            // Populate Gender Selection
            populateGenderOptions(allAccidentData);

            // Populate Activity Selection (initial based on "all cantons")
            updateActivityOptionsBasedOnCanton();

            // Set Event Listeners for filters
            wireFilterEvents();

            // Initial Rendering
            applyFiltersAndRender();
        })
        .catch(err => {
            console.error("Error initializing visualization:", err);
        });
}



/* ---------------------------------------------------------
   Populate Year Dropdowns
--------------------------------------------------------- */
function populateYearOptions(min, max) {
    const yearStart = document.getElementById("year-start");
    const yearEnd = document.getElementById("year-end");
    if (!yearStart || !yearEnd) return;

    // Generate Options
    // use availableYears global or new generate range(min, max)
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

    // Remember current value to restore if possible
    const currentValue = select.value;

    select.innerHTML = '<option value="all">Alle Kantone</option>';

    // If data provided, only show cantons present in data
    let relevantCodes = Object.keys(cantonNames);
    if (data) {
        const cantonField = mapMode === "wohnort" ? "kanton_wohnort" : "kanton_unfall";
        const codesInDataset = new Set(data.map(d => d[cantonField]));
        relevantCodes = relevantCodes.filter(c => codesInDataset.has(c));
    }

    // Sort by name
    relevantCodes.sort((a, b) =>
        cantonNames[a].localeCompare(cantonNames[b])
    );

    relevantCodes.forEach(code => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = cantonNames[code];
        select.appendChild(opt);
    });

    // Restore value if still valid
    if (currentValue && (currentValue === "all" || relevantCodes.includes(currentValue))) {
        select.value = currentValue;
    } else {
        select.value = "all";
        // If value dropped out, reset global selection too
        if (currentValue !== "all") {
             selectedCantons = [];
             window.selectedCantons = [];
        }
    }
}

/* ---------------------------------------------------------
   Helper: Filter Canton Options based on Activity
--------------------------------------------------------- */
function updateCantonOptionsBasedOnActivity() {
    const selectActivity = document.getElementById("filter-activity");
    if (!selectActivity) return;

    const currentActivity = selectActivity.value;
    
    if (currentActivity === "all") {
        // Show all cantons (based on all data)
        populateCantonOptions(allAccidentData);
    } else {
        // Show only cantons having this activity
        const relevantData = allAccidentData.filter(d => d.taetigkeit === currentActivity);
        populateCantonOptions(relevantData);
    }
}

/* ---------------------------------------------------------
   Populate Age Group Select
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
   Populate Gender Select
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
        // Prettify label
        if (g === "m") opt.textContent = "Male";
        else if (g === "f") opt.textContent = "Female";
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
   Populate Activity Select
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
    // Sort alphabetically
    uniqueActivities.sort((a, b) => a.localeCompare(b));

    selectActivity.innerHTML = "";
    const optionAll = document.createElement("option");
    optionAll.value = "all";
    optionAll.textContent = "Alle Unfalltypen";
    selectActivity.appendChild(optionAll);

    uniqueActivities.forEach(act => {
        const opt = document.createElement("option");
        opt.value = act;
        opt.textContent = act;
        selectActivity.appendChild(opt);
    });
}

/* ---------------------------------------------------------
   Helper: Reset Click State
--------------------------------------------------------- */
function resetClickState() {
    clickedActivity = null;
    clickedGender = null;
}

/* ---------------------------------------------------------
   Filter Events (Reset, Dropdowns, Year Slider)
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

    // Reset Button
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

            // Reset Canton Selection (global and for map)
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

    // Jahr-Dropdowns Change-Listeners
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
            // Sync with global variable for chart_map (if needed)
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
   Central Filter Logic + Rendering
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
    let toYear   = 2023; // Default max

    // 1. Filter Base Data (Hard Filters: Branch, Age, Canton, Dropdowns)
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
    
    // 3. Data for Map (Fully Filtered: Hard + Soft)
    let mapData = baseData;
    if (clickedActivity) {
        mapData = mapData.filter(d => d.taetigkeit === clickedActivity);
    }
    if (clickedGender) {
        mapData = mapData.filter(d => d.geschlecht === clickedGender);
    }

    // 4. Data for Trend Chart (Activity)
    // Hard Filters applied.
    // Soft Filters: Apply Gender click, IGNORE Activity click (Context)
    let trendData = baseData;
    if (clickedGender) {
        trendData = trendData.filter(d => d.geschlecht === clickedGender);
    }

    // 5. Data for Donut Chart (Gender)
    // Hard Filters applied.
    // Soft Filters: Apply Activity click, IGNORE Gender click (Context)
    let barData = baseData;
    if (clickedActivity) {
        barData = barData.filter(d => d.taetigkeit === clickedActivity);
    }



    // 6. Data for Timeline
    // Shows evolution over time. If we filter by specific criteria, timeline should reflect that subset.
    
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

    // Helper: Append Canton Code for Map
    const mapDataWithCanton = mapData.map(d => ({ ...d, kanton: d[cantonField] || "" }));
    const trendDataWithCanton = trendData.map(d => ({ ...d, kanton: d[cantonField] || "" }));
    const barDataWithCanton = barData.map(d => ({ ...d, kanton: d[cantonField] || "" }));

    // Update Map
    if (typeof renderMap === "function") {
        try {
            renderMap(mapDataWithCanton);
        } catch (e) {
            console.error("Fehler in renderMap:", e);
        }
    }

    // Update Trend Chart
    if (typeof renderTrendChart === "function") {
        try {
            renderTrendChart(trendDataWithCanton);
        } catch (e) {
            console.error("Fehler in renderTrendChart:", e);
        }
    }

    // Update Bar Chart (Donut)
    if (typeof renderBarChart === "function") {
        try {
            renderBarChart(barDataWithCanton);
        } catch (e) {
            console.error("Fehler in renderBarChart:", e);
        }
    }

    // Update Timeline
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
   Callback from chart_timeline.js (Brushing)
--------------------------------------------------------- */
window.updateYearRangeFromBrush = function(startYear, endYear) {
    // Validation
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
        updateYearEndOptions(startYear); // Adjust options
        yearEnd.value = endYear;
    }
    if (yearLabel) {
        yearLabel.textContent = `${startYear} – ${endYear}`;
    }

    // Render (do not re-render timeline completely to avoid brush flicker)
    applyFiltersAndRender();
};

/* ---------------------------------------------------------
   Callback from chart_map.js, when cantons are clicked
--------------------------------------------------------- */
window.updateChartsFromMap = function(cantons) {
    selectedCantons = cantons.slice();  // local copy
    window.selectedCantons = selectedCantons; // Global sync

    // Update Dropdown
    const selectCanton = document.getElementById("filter-canton");
    if (selectCanton) {
        if (selectedCantons.length === 0) {
            selectCanton.value = "all";
        } else if (selectedCantons.length === 1) {
            selectCanton.value = selectedCantons[0];
        } else {
            // For multi-selection: Dropdown cannot natively show this -> keep "all"
            selectCanton.value = "all";
        }
    }

    // Update Activity Options
    updateActivityOptionsBasedOnCanton();

    applyFiltersAndRender();
};

/* ---------------------------------------------------------
   Helper: Filter Activity Options based on Canton
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

    // Attempt to restore the old selection.
    // If the value doesn't exist, the browser often falls back to the first one ("all").
    // To be safe, we check if we can set it.
    // Since populateActivityOptions rebuilds the DOM, the old value is lost.
    // We set it anew. If it's not in the options, it will be ignored (or empty).
    // We want "all" as fallback.
    
    // Check if currentActivity exists in relevantData (unless it is "all")
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
   Synchronize Year Selects (End >= Start)
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


