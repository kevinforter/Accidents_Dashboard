// chart_map.js
// Interactive Swiss Map for Insurance Accidents
// - Data: loadAccidentData() -> { jahr, kanton, zweig, altersgruppe, taetigkeit, anzahl }
// - Population: data/bevoelkerung.csv
// - TopoJSON: data/swiss-maps.json
// - Coloring: Accidents per 1,000 inhabitants per year
// - Click: Select up to 5 cantons, updateChartsFromMap(selectedCantons)

window.updateChartsFromMap = window.updateChartsFromMap || function () {};

// Mapping from TopoJSON names -> Canton Codes
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

// Set of all Canton Codes (for detection in CSV)
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

/* ------------------ Load Geo & Pop Data ------------------ */

// TopoJSON -> GeoJSON
function loadMapGeoData() {
    if (mapGeoData) return Promise.resolve(mapGeoData);

    return d3.json("data/swiss-maps.json").then(raw => {
        if (raw.type === "Topology") {
            mapGeoData = topojson.feature(raw, raw.objects.cantons);
        } else {
            mapGeoData = raw;
        }
        console.log("Map GeoData loaded:", mapGeoData.features.length, "Cantons");
        return mapGeoData;
    });
}

function nameToKantonCode(name) {
    if (!name) return null;
    const trimmed = name.trim();

    // 1) Direct match in mapping
    if (cantonMapping[trimmed]) {
        return cantonMapping[trimmed];
    }

    // 2) CSV Name corresponds to a part of a mapping name
    for (const [key, code] of Object.entries(cantonMapping)) {
        const parts = key.split("/").map(s => s.trim());
        if (parts.includes(trimmed)) {
            return code;
        }
    }

    // 3) Comparison in lowercase
    const lower = trimmed.toLowerCase();
    for (const [key, code] of Object.entries(cantonMapping)) {
        const parts = key.split("/").map(s => s.trim().toLowerCase());
        if (parts.includes(lower)) {
            return code;
        }
    }

    console.warn("⚠️ Population canton without mapping:", name);
    return null;
}

// Load Population & Map to Canton Code
// -> Keep all years so average per period can be calculated later
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
        console.log("Population data (all years) loaded:", populationData.length);
        return populationData;
    });
}

/* ------------------ Canton Helpers ------------------ */

function getCantonCodeFromFeature(f) {
    const props = f.properties || {};
    const name = props.name || props.NAME;

    if (!name) return null;

    // Direct match
    if (cantonMapping[name]) {
        return cantonMapping[name];
    }

    // Name e.g. "Fribourg / Freiburg"
    const nameParts = name.split("/").map(n => n.trim());

    for (const part of nameParts) {
        if (cantonMapping[part]) {
            return cantonMapping[part];
        }
    }

    // Last attempt: Uppercase codes in GeoJSON
    const raw =
        props.KANTON ||
        props.kanton ||
        props.abbr ||
        props.code;

    if (raw) {
        const code = raw.trim().toUpperCase();
        if (cantonCodes.has(code)) return code;
    }

    console.warn("⚠️ No mapping for canton:", name);
    return null;
}

function getCantonNameFromFeature(f) {
    const props = f.properties || {};
    return props.name || props.NAME || getCantonCodeFromFeature(f) || "Unbekannt";
}

/* ------------------ Main Function: Render Map ------------------ */

function renderMap(accidentData) {
    const container = d3.select("#map-container");
    if (container.empty()) return;

    // Clear container - IMPORTANT: Only clear when data is ready (see below),
    // or leave here, but risk of race conditions.
    // Better: We clear it in the Promise callback.
    // container.html(""); // <-- Moved down

    const tooltip = getMapTooltip();

    Promise.all([loadMapGeoData(), loadPopulationData()]).then(
        ([geo, pop]) => {
            // Clear container now and adjust classes
            container.html("");
            container.classed("chart-placeholder", false);
            container.classed("chart-surface", true);

            // Measure only now, after classes (padding/border) are removed
            const node = container.node();
            const rect = node.getBoundingClientRect();
            const width = rect.width || 900;
            const height = rect.height || 420;

            // Aggregate accidents per canton (absolute numbers in selected period)
            const accidentsByCanton = d3.rollups(
                accidentData,
                v => d3.sum(v, d => d.anzahl || 0),
                d => d.kanton
            );
            const accidentMap = new Map(accidentsByCanton);
            console.log("Accidents per canton:", accidentsByCanton);

            // Determine years in current accident dataset
            const yearSet = new Set(accidentData.map(d => d.jahr));
            const years = Array.from(yearSet).sort();
            const yearCount = years.length > 0 ? years.length : 1;

            // Sum population per canton over selected years
            // pop: [{ kanton, jahr, bev }]
            const popSumByCanton = d3.rollups(
                pop.filter(row => yearSet.has(row.jahr)),
                v => d3.sum(v, d => d.bev),
                d => d.kanton
            );
            const popSumMap = new Map(popSumByCanton);
            console.log("Population sums in period:", popSumByCanton);

            // Write absolute & relative values into GeoJSON Features
            geo.features.forEach(f => {
                const code = getCantonCodeFromFeature(f); // z.B. "ZH"
                const absTotal = code ? (accidentMap.get(code) || 0) : 0;

                const popSum = code ? popSumMap.get(code) : undefined;
                const avgPop =
                    popSum && yearCount > 0 ? popSum / yearCount : null;

                // Rate: Accidents per 1,000 inhabitants per year
                const ratePerYear =
                    avgPop && yearCount > 0
                        ? (absTotal / (avgPop * yearCount)) * 1000
                        : null;

                f.properties._code = code;
                f.properties._name = getCantonNameFromFeature(f);

                // for Tooltip
                f.properties._abs = absTotal;             // Total accidents in period
                f.properties._populationAvg = avgPop;     // Avg population in period
                f.properties._years = yearCount;          // Number of years
                f.properties._rate = ratePerYear;         // Accidents per 1,000 inh. per year
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

            // Map slightly smaller (85%) and shifted up (-30px)
            const padX = width * 0.075;
            const padY = height * 0.075;
            const shiftY = 30;
            mapProjection.fitExtent(
                [[padX, padY - shiftY], [width - padX, height - padY - shiftY]], 
                geo
            );
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

                    // Case 1: Activity filtered & Canton does not have this activity -> Dark
                    if (isActivityFiltered && !hasAccidents) {
                        return "#5a5248";
                    }

                    // Case 2: Selection active
                    if (sel.length > 0) {
                        if (code && sel.includes(code)) {
                            return "rgb(201, 128, 66)"; // Selected
                        } else {
                            return "#5a5248"; // Not selected (Background)
                        }
                    }

                    // Case 3: Normal Color Gradient
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

                    // Remember original transform
                    const originalTransform = el.attr("transform") || "";
                    el.attr("data-original-transform", originalTransform);

                    // Calculate centroid of canton
                    const [cx, cy] = mapPath.centroid(d);

                    // Highlight Canton
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

                    // Show Tooltip
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

                    // Check if an activity is filtered and the canton does not have it
                    const activityFilter = document.getElementById("filter-activity");
                    const isActivityFiltered = activityFilter && activityFilter.value !== "all";
                    const hasAccidents = d.properties._abs > 0;

                    if (isActivityFiltered && !hasAccidents) {
                        return; // Ignore click
                    }

                    if (selectedCantons.includes(code)) {
                        // If already selected: Deselect (Toggle off)
                        selectedCantons = [];
                    } else {
                        // If not selected: Replace selection (Single Select)
                        selectedCantons = [code];
                    }

                    // Redraw map (for selection highlight)
                    // renderMap(accidentData); // <--- REMOVED: updateChartsFromMap handles this via main.js -> applyFiltersAndRender -> renderMap

                    // Filter Charts (Trend + Bar) - if used
                    try {
                        window.updateChartsFromMap(selectedCantons);
                    } catch (e) {
                        console.warn("updateChartsFromMap not implemented:", e);
                    }
                });

            if (!selectedCantons || selectedCantons.length === 0) {
                addMapLegend(svg, colorScale, maxRate, width, height);
            }
        }
    );
}

/* ------------------ Legend ------------------ */

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

    // Generate multiple stops for the gradient to correctly represent the color scale
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
