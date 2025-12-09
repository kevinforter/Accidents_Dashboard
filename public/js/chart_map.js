// chart_map.js
// Interaktive Schweizerkarte für Versicherungsunfälle
// - Daten: loadAccidentData() -> { jahr, kanton, zweig, altersgruppe, taetigkeit, anzahl }
// - Bevölkerung: data/bevoelkerung.csv
// - TopoJSON: data/swiss-maps.json
// - Färbung: Unfälle pro 1'000 Einwohner und Jahr
// - Klick: bis zu 5 Kantone auswählen, updateChartsFromMap(selectedCantons)

window.updateChartsFromMap = window.updateChartsFromMap || function () {};

// Mapping von Namen im TopoJSON -> Kantonskürzel
const cantonMapping = {
    "Zürich": "ZH",
    "Bern / Berne": "BE",
    "Luzern": "LU",
    "Uri": "UR",
    "Schwyz": "SZ",
    "Obwalden": "OW",
    "Nidwalden": "NW",
    "Glarus": "GL",
    "Zug": "ZG",
    "Fribourg / Freiburg": "FR",
    "Solothurn": "SO",
    "Basel-Stadt": "BS",
    "Basel-Landschaft": "BL",
    "Schaffhausen": "SH",
    "Appenzell Ausserrhoden": "AR",
    "Appenzell Innerrhoden": "AI",
    "St. Gallen": "SG",
    "Graubünden / Grigioni / Grischun": "GR",
    "Aargau": "AG",
    "Thurgau": "TG",
    "Ticino": "TI",
    "Ticino / Tessin": "TI",
    "Tessin": "TI",
    "Vaud": "VD",
    "Waadt": "VD",
    "Vaud / Waadt": "VD",
    "Valais / Wallis": "VS",
    "Neuchâtel": "NE",
    "Genève / Genf": "GE",
    "Genf": "GE",
    "Geneve": "GE",
    "Genève": "GE",
    "Genf / Genève": "GE",
    "Jura": "JU"
};

// Menge aller Kantonskürzel (für Erkennung in CSV)
const cantonCodes = new Set([
    "ZH","BE","LU","UR","SZ","OW","NW","GL","ZG",
    "FR","SO","BS","BL","SH","AR","AI","SG","GR",
    "AG","TG","TI","VD","VS","NE","GE","JU"
]);

let mapGeoData = null;
let populationData = null;
window.selectedCantons = window.selectedCantons || [];

const mapProjection = d3.geoMercator();
const mapPath = d3.geoPath().projection(mapProjection);

let mapTooltip = null;
function getMapTooltip() {
    if (!mapTooltip) {
        mapTooltip = d3
            .select("body")
            .append("div")
            .attr("class", "map-tooltip")
            .style("opacity", 0);
    }
    return mapTooltip;
}

/* ------------------ Geo- & Pop-Daten laden ------------------ */

// TopoJSON -> GeoJSON
function loadMapGeoData() {
    if (mapGeoData) return Promise.resolve(mapGeoData);

    return d3.json("data/swiss-maps.json").then(raw => {
        if (raw.type === "Topology") {
            mapGeoData = topojson.feature(raw, raw.objects.cantons);
        } else {
            mapGeoData = raw;
        }
        console.log("Karten-GeoData geladen:", mapGeoData.features.length, "Kantone");
        return mapGeoData;
    });
}

function nameToKantonCode(name) {
    if (!name) return null;
    const trimmed = name.trim();

    // 1) direkter Treffer im Mapping
    if (cantonMapping[trimmed]) {
        return cantonMapping[trimmed];
    }

    // 2) CSV-Name entspricht einem Teil eines Mapping-Namens
    for (const [key, code] of Object.entries(cantonMapping)) {
        const parts = key.split("/").map(s => s.trim());
        if (parts.includes(trimmed)) {
            return code;
        }
    }

    // 3) Vergleich in lowercase
    const lower = trimmed.toLowerCase();
    for (const [key, code] of Object.entries(cantonMapping)) {
        const parts = key.split("/").map(s => s.trim().toLowerCase());
        if (parts.includes(lower)) {
            return code;
        }
    }

    console.warn("⚠️ Bevölkerung-Kanton ohne Mapping:", name);
    return null;
}

// Bevölkerung laden & auf Kantonskürzel mappen
// -> alle Jahre behalten, damit später Durchschnitt pro Zeitraum berechnet werden kann
function loadPopulationData() {
    if (populationData) return Promise.resolve(populationData);

    return d3.csv("data/bevoelkerung.csv", d => {
        const name = (d.kanton || d.KANTON || "").trim();
        const jahr = d.jahr ? +d.jahr : (d.JAHR ? +d.JAHR : NaN);
        const bev =
            d.bevolkerung ? +d.bevolkerung :
                (d.BEVOELKERUNG ? +d.BEVOELKERUNG :
                    (d.Bevoelkerung ? +d.Bevoelkerung : NaN));

        if (!name || isNaN(jahr) || isNaN(bev)) return null;

        const code = nameToKantonCode(name);
        if (!code) return null;

        return { kanton: code, jahr, bev };
    }).then(rows => {
        populationData = rows.filter(Boolean);
        console.log("Bevölkerungsdaten (alle Jahre) geladen:", populationData.length);
        return populationData;
    });
}

/* ------------------ Canton-Helfer ------------------ */

function getCantonCodeFromFeature(f) {
    const props = f.properties || {};
    const name = props.name || props.NAME;

    if (!name) return null;

    // direkter Treffer
    if (cantonMapping[name]) {
        return cantonMapping[name];
    }

    // Name z. B. "Fribourg / Freiburg"
    const nameParts = name.split("/").map(n => n.trim());

    for (const part of nameParts) {
        if (cantonMapping[part]) {
            return cantonMapping[part];
        }
    }

    // Letzter Versuch: Grossbuchstaben-Codes im GeoJSON
    const raw =
        props.KANTON ||
        props.kanton ||
        props.abbr ||
        props.code;

    if (raw) {
        const code = raw.trim().toUpperCase();
        if (cantonCodes.has(code)) return code;
    }

    console.warn("⚠️ Kein Mapping für Kanton:", name);
    return null;
}

function getCantonNameFromFeature(f) {
    const props = f.properties || {};
    return props.name || props.NAME || getCantonCodeFromFeature(f) || "Unbekannt";
}

/* ------------------ Hauptfunktion: Karte rendern ------------------ */

function renderMap(accidentData) {
    const container = d3.select("#map-container");
    if (container.empty()) return;

    // Container leeren - WICHTIG: Erst leeren, wenn Daten da sind (siehe unten),
    // oder hier lassen, aber Gefahr von Race Conditions.
    // Besser: Wir leeren ihn erst im Promise-Callback.
    // container.html(""); // <-- Verschoben nach unten

    const tooltip = getMapTooltip();

    Promise.all([loadMapGeoData(), loadPopulationData()]).then(
        ([geo, pop]) => {
            // Container jetzt leeren und Klassen anpassen
            container.html("");
            container.classed("chart-placeholder", false);
            container.classed("chart-surface", true);

            // Jetzt erst messen, nachdem die Klassen (Padding/Border) entfernt sind
            const node = container.node();
            const rect = node.getBoundingClientRect();
            const width = rect.width || 900;
            const height = rect.height || 420;

            // Unfälle pro Kanton aggregieren (absolute Zahlen im gewählten Zeitraum)
            const accidentsByCanton = d3.rollups(
                accidentData,
                v => d3.sum(v, d => d.anzahl || 0),
                d => d.kanton
            );
            const accidentMap = new Map(accidentsByCanton);
            console.log("Unfälle pro Kanton:", accidentsByCanton);

            // Jahre im aktuellen Unfall-Datensatz bestimmen
            const yearSet = new Set(accidentData.map(d => d.jahr));
            const years = Array.from(yearSet).sort();
            const yearCount = years.length > 0 ? years.length : 1;

            // Bevölkerung pro Kanton über die ausgewählten Jahre aufsummieren
            // pop: [{ kanton, jahr, bev }]
            const popSumByCanton = d3.rollups(
                pop.filter(row => yearSet.has(row.jahr)),
                v => d3.sum(v, d => d.bev),
                d => d.kanton
            );
            const popSumMap = new Map(popSumByCanton);
            console.log("Bevölkerungssummen im Zeitraum:", popSumByCanton);

            // Absolute & relative Werte in GeoJSON-Features schreiben
            geo.features.forEach(f => {
                const code = getCantonCodeFromFeature(f); // z.B. "ZH"
                const absTotal = code ? (accidentMap.get(code) || 0) : 0;

                const popSum = code ? popSumMap.get(code) : undefined;
                const avgPop =
                    popSum && yearCount > 0 ? popSum / yearCount : null;

                // Rate: Unfälle pro 1'000 Einwohner und Jahr
                const ratePerYear =
                    avgPop && yearCount > 0
                        ? (absTotal / (avgPop * yearCount)) * 1000
                        : null;

                f.properties._code = code;
                f.properties._name = getCantonNameFromFeature(f);

                // für Tooltip
                f.properties._abs = absTotal;             // Summe Unfälle im Zeitraum
                f.properties._populationAvg = avgPop;     // Ø-Bevölkerung im Zeitraum
                f.properties._years = yearCount;          // Anzahl Jahre
                f.properties._rate = ratePerYear;         // Unfälle pro 1'000 Einw. und Jahr
            });

            const maxRate =
                d3.max(
                    geo.features,
                    f => (f.properties._rate != null ? f.properties._rate : 0)
                ) || 0;

            const colorScale = d3
                .scaleSequential(d3.interpolateYlOrRd)
                .domain([0, maxRate || 1]);

            const svg = container
                .append("svg")
                .attr("width", "100%")
                .attr("height", height)
                .attr("viewBox", `0 0 ${width} ${height}`)
                .style("overflow", "visible");

            mapProjection.fitSize([width, height], geo);
            mapPath.projection(mapProjection);

            svg
                .selectAll("path.canton")
                .data(geo.features)
                .enter()
                .append("path")
                .attr("class", "canton")
                .attr("d", mapPath)
                .attr("fill", d => {
                    const code = d.properties._code;
                    const sel = window.selectedCantons || [];
                    const activityFilter = document.getElementById("filter-activity");
                    const isActivityFiltered = activityFilter && activityFilter.value !== "all";
                    const hasAccidents = d.properties._abs > 0;

                    // 1. Fall: Aktivität gefiltert & Kanton hat diese Aktivität nicht -> Dunkel
                    if (isActivityFiltered && !hasAccidents) {
                        return "#5a5248";
                    }

                    // 2. Fall: Auswahl aktiv
                    if (sel.length > 0) {
                        if (code && sel.includes(code)) {
                            return "rgb(201, 128, 66)"; // Ausgewählt
                        } else {
                            return "#5a5248"; // Nicht ausgewählt (Hintergrund)
                        }
                    }

                    // 3. Fall: Normaler Farbverlauf
                    const r = d.properties._rate;
                    return r != null ? colorScale(r) : "#eee";
                })
                .attr("stroke", "#ffffff")
                .attr("stroke-width", 0.8)
                .on("mouseover", function (event, d) {
                    const p = d.properties;
                    const abs = p._abs || 0;
                    const avgPop = p._populationAvg || null;
                    const yearsCount = p._years || 1;

                    const rate =
                        p._rate != null ? p._rate.toFixed(2) : "k.A.";

                    const absText = abs.toLocaleString("de-CH");
                    const popText =
                        avgPop != null ? avgPop.toLocaleString("de-CH") : "k.A.";

                    const el = d3.select(this);

                    // ursprünglichen transform merken
                    const originalTransform = el.attr("transform") || "";
                    el.attr("data-original-transform", originalTransform);

                    // Mittelpunkt des Kantons berechnen
                    const [cx, cy] = mapPath.centroid(d);

                    // Kanton hervorheben
                    const currentFill = el.attr("fill");
                    const hoverStroke = d3.color(currentFill).darker(1.5);

                    el.raise()
                        .attr("stroke", hoverStroke)
                        .attr("stroke-width", 2.2)
                        .transition()
                        .duration(80)
                        .attr(
                            "transform",
                            `translate(${cx},${cy}) scale(1.04) translate(${-cx},${-cy})`
                        )
                        .attr("filter", "drop-shadow(0px 0px 4px rgba(0,0,0,0.35))");

                    // Tooltip anzeigen
                    tooltip
                        .style("opacity", 1)
                        .html(
                            `<strong>${p._name}</strong><br>
             Absolut: ${absText} Unfälle<br>
             Relativ: ${rate} / 1'000 Einwohner und Jahr<br>
             Bevölkerung: ${popText} (Ø über ${yearsCount} Jahr${yearsCount > 1 ? "e" : ""})`
                        );

                    // Smart Positioning
                    const tooltipNode = tooltip.node();
                    const tooltipRect = tooltipNode.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    let left = event.pageX + 12;
                    let top = event.pageY + 12;

                    // Flip left if too close to right edge
                    if (left + tooltipRect.width > viewportWidth - 20) {
                        left = event.pageX - tooltipRect.width - 12;
                    }

                    // Flip up if too close to bottom edge
                    if (top + tooltipRect.height > viewportHeight - 20) {
                        top = event.pageY - tooltipRect.height - 12;
                    }

                    tooltip
                        .style("left", left + "px")
                        .style("top", top + "px");
                })
                .on("mousemove", function (event) {
                    const tooltipNode = tooltip.node();
                    const tooltipRect = tooltipNode.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    let left = event.pageX + 12;
                    let top = event.pageY + 12;

                    // Flip left if too close to right edge
                    if (left + tooltipRect.width > viewportWidth - 20) {
                        left = event.pageX - tooltipRect.width - 12;
                    }

                    // Flip up if too close to bottom edge
                    if (top + tooltipRect.height > viewportHeight - 20) {
                        top = event.pageY - tooltipRect.height - 12;
                    }

                    tooltip
                        .style("left", left + "px")
                        .style("top", top + "px");
                })
                .on("mouseout", function () {
                    const el = d3.select(this);
                    const originalTransform = el.attr("data-original-transform") || "";

                    el.transition()
                        .duration(80)
                        .attr("stroke-width", 0.8)
                        .attr("stroke", "#ffffff")
                        .attr("transform", originalTransform)
                        .attr("filter", "none");

                    tooltip.style("opacity", 0);
                })
                .on("click", function (event, d) {
                    const code = d.properties._code;
                    if (!code) return;

                    // Prüfen, ob eine Aktivität gefiltert ist und der Kanton diese nicht hat
                    const activityFilter = document.getElementById("filter-activity");
                    const isActivityFiltered = activityFilter && activityFilter.value !== "all";
                    const hasAccidents = d.properties._abs > 0;

                    if (isActivityFiltered && !hasAccidents) {
                        return; // Klick ignorieren
                    }

                    if (selectedCantons.includes(code)) {
                        // Falls bereits ausgewählt: abwählen (Toggle off)
                        selectedCantons = [];
                    } else {
                        // Falls nicht ausgewählt: Auswahl ersetzen (Single Select)
                        selectedCantons = [code];
                    }

                    // Karte neu zeichnen (für Highlight der Auswahl)
                    // renderMap(accidentData); // <--- ENTFERNT: Das macht updateChartsFromMap via main.js -> applyFiltersAndRender -> renderMap

                    // Charts (Trend + Balken) filtern – falls du das nutzt
                    try {
                        window.updateChartsFromMap(selectedCantons);
                    } catch (e) {
                        console.warn("updateChartsFromMap nicht implementiert:", e);
                    }
                });

            if (!selectedCantons || selectedCantons.length === 0) {
                addMapLegend(svg, colorScale, maxRate, width, height);
            }
        }
    );
}

/* ------------------ Legende ------------------ */

function addMapLegend(svg, colorScale, maxRate, width, height) {
    svg.selectAll(".legend-group").remove();

    const legendWidth = 200;
    const legendHeight = 14;

    const legendGroup = svg
        .append("g")
        .attr("class", "legend-group")
        .attr(
            "transform",
            `translate(${(width - legendWidth) / 2}, ${height - 40})`
        );

    const defs = svg.append("defs");
    const gradientId = "legend-gradient-map";

    const gradient = defs
        .append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("x2", "100%")
        .attr("y1", "0%")
        .attr("y2", "0%");

    // Mehrere Stops für den Gradienten generieren, um die Farbskala korrekt abzubilden
    const stops = d3.range(0, 1.1, 0.1); // 0, 0.1, ..., 1.0
    stops.forEach(offset => {
        gradient
            .append("stop")
            .attr("offset", `${offset * 100}%`)
            .attr("stop-color", colorScale(offset * (maxRate || 1)));
    });

    legendGroup
        .append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", `url(#${gradientId})`)
        .style("stroke", "#e4d6c4");

    const legendScale = d3
        .scaleLinear()
        .domain([0, maxRate || 1])
        .range([0, legendWidth]);

    const legendAxis = d3
        .axisBottom(legendScale)
        .ticks(4)
        .tickFormat(d => d.toFixed(1));

    legendGroup
        .append("g")
        .attr("transform", `translate(0, ${legendHeight})`)
        .call(legendAxis)
        .select(".domain")
        .remove();

    legendGroup
        .append("text")
        .attr("x", legendWidth / 2)
        .attr("y", -4)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .style("fill", "#7b7164")
        .text("Unfälle pro 1'000 Einwohner und Jahr");
}
