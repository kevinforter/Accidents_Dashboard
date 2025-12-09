// Hilfsfunktion: Breite des Containers bestimmen
function getContainerSize(container, defaultWidth = 600, defaultHeight = 260) {
    const rect = container.getBoundingClientRect();
    const width = rect.width && rect.width > 0 ? rect.width : defaultWidth;
    const height = rect.height && rect.height > 0 ? rect.height : defaultHeight;
    return { width, height };
}

// Geschlechterverteilung: relative Anteile (Donut)
function renderBarChart(data) {
    const container = document.getElementById("bar-container");
    if (!container) return;

    const byGender = d3.rollups(
        data,
        v => d3.sum(v, d => d.anzahl),
        d => (d.geschlecht || "unbekannt").toLowerCase()
    )
        .map(([geschlecht, sum]) => ({ geschlecht, sum }))
        .filter(d => d.sum > 0)
        .sort((a, b) => {
            // Fixed order: Mann (m), Frau (f), Others
            const order = { "m": 1, "f": 2 };
            const valA = order[a.geschlecht] || 99;
            const valB = order[b.geschlecht] || 99;
            return valA - valB;
        });

    if (byGender.length === 0) {
        container.textContent = "Keine Daten vorhanden.";
        return;
    }

    container.innerHTML = ""; // Platzhalter entfernen

    // Wenn die Karte geladen wurde, soll das Diagramm bündig ohne Padding sitzen
    container.classList.remove("chart-placeholder");
    container.classList.add("chart-surface");

    const { width, height } = getContainerSize(container, 520, 280);
    const size = Math.min(width, height);
    const radius = Math.max(50, (size / 2) - 16);

    const total = d3.sum(byGender, d => d.sum) || 1;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const centerX = width / 2;
    const centerY = height / 2;

    const pie = d3.pie()
        .value(d => d.sum)
        .sort(null);

    const arc = d3.arc()
        .innerRadius(radius * 0.55)
        .outerRadius(radius);

    const slices = pie(byGender);

    const arcGroup = svg.append("g")
        .attr("transform", `translate(${centerX},${centerY})`);

    const arcs = arcGroup
        .selectAll("g.slice")
        .data(slices)
        .enter()
        .append("g")
        .attr("class", "slice");

    const tooltip = getChartTooltip();

    arcs.append("path")
        .attr("d", arc)
        .attr("fill", d => colorGender(d.data.geschlecht))
        .on("click", function(event, d) {
            if (window.toggleGenderFilter) {
                window.toggleGenderFilter(d.data.geschlecht);
            }
        })
        .on("mouseover", function(event, d) {
            // Dim all other slices
            arcGroup.selectAll("path").attr("opacity", 0.3);
            // Highlight current slice
            d3.select(this).attr("opacity", 1);
            
            const pct = (d.data.sum / total) * 100;
            tooltip.style("opacity", 1)
                .html(`<strong>${labelGender(d.data.geschlecht)}</strong><br>${d.data.sum.toLocaleString("de-CH")} Unfälle<br>(${pct.toFixed(1)} %)`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
            
            // Cursor pointer to indicate clickable
            d3.select(this).style("cursor", "pointer");
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function() {
            // Restore opacity based on selection
            const selectedGender = window.getSelectedGender ? window.getSelectedGender() : "all";
            arcGroup.selectAll("path").attr("opacity", d => 
                (selectedGender === "all" || selectedGender === d.data.geschlecht) ? 1 : 0.3
            );
            tooltip.style("opacity", 0);
        });

    // Set initial opacity based on selection
    const selectedGender = window.getSelectedGender ? window.getSelectedGender() : "all";
    arcGroup.selectAll("path").attr("opacity", d => 
        (selectedGender === "all" || selectedGender === d.data.geschlecht) ? 1 : 0.3
    );

    // Labels ausserhalb mit Polylines
    const labelArc = d3.arc()
        .innerRadius(radius * 0.95)
        .outerRadius(radius * 0.95);

    const outerArc = d3.arc()
        .innerRadius(radius * 1.12)
        .outerRadius(radius * 1.12);

    const midAngle = d => (d.startAngle + d.endAngle) / 2;

    // Pre-calculate positions to check for legend overlap
    // Legend is at top-left (0,0).
    const legendHeight = byGender.length * 20 + 20;
    let legendCollision = false;

    slices.forEach(d => {
        const mid = midAngle(d);
        const isRight = mid < Math.PI;
        
        // Default positions
        const posLine = outerArc.centroid(d);
        posLine[0] = radius * 1.2 * (isRight ? 1 : -1);
        
        const posText = outerArc.centroid(d);
        posText[0] = radius * 1.26 * (isRight ? 1 : -1);

        // Check collision with legend (Top-Left)
        // Only relevant if label is on the left side
        if (!isRight) {
            // const absX = centerX + posText[0]; // Not needed if we just check Y and side
            const absY = centerY + posText[1];
            
            // If the text label (approx) falls into the legend box height
            // and is on the left side, we assume collision or near-collision.
            if (absY < legendHeight && absY > -20) {
                legendCollision = true;
            }
        }
        
        d.posLine = posLine;
        d.posText = posText;
    });

    arcs.append("polyline")
        .filter(d => d.endAngle - d.startAngle > 0.04)
        .attr("points", d => {
            return [arc.centroid(d), labelArc.centroid(d), d.posLine];
        })
        .attr("fill", "none")
        .attr("stroke", "#7a5a33")
        .attr("stroke-width", 1)
        .attr("opacity", 0.9);

    arcs.append("text")
        .filter(d => d.endAngle - d.startAngle > 0.04)
        .attr("transform", d => `translate(${d.posText})`)
        .attr("text-anchor", d => midAngle(d) < Math.PI ? "start" : "end")
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .style("fill", "#3f3a33")
        .text(d => {
            const pct = (d.data.sum / total) * 100;
            return `${labelGender(d.data.geschlecht)} – ${pct.toFixed(1)} %`;
        });

    // Legend positioning
    // If collision detected, move to top-right (width - approx 100px)
    // Otherwise top-left (0,0)
    const legendX = legendCollision ? (width - 110) : 0;

    const legend = svg.append("g")
        .attr("transform", `translate(${legendX}, 0)`);

    const legendItems = legend.selectAll("g")
        .data(byGender)
        .enter()
        .append("g")
        .attr("transform", (_, i) => `translate(0, ${i * 20})`);

    legendItems.append("rect")
        .attr("width", 12)
        .attr("height", 12)
        .attr("rx", 2)
        .attr("fill", d => colorGender(d.geschlecht));

    legendItems.append("text")
        .attr("x", 18)
        .attr("y", 10)
        .style("font-size", "12px")
        .style("fill", "#3f3a33")
        .text(d => {
            return `${labelGender(d.geschlecht)} (${d.sum.toLocaleString("de-CH")})`;
        });
}

function labelGender(code) {
    switch (code) {
        case "m":
            return "Männer";
        case "f":
            return "Frauen";
        case "u":
        case "x":
            return "Unbekannt";
        default:
            return code ? code.toUpperCase() : "Unbekannt";
    }
}

function colorGender(code) {
    const key = (code || "").toLowerCase();
    if (key === "m") return "#c98042";   // warm orange
    if (key === "f") return "#7a5a33";   // dark brown
    if (key === "u" || key === "x" || key === "unbekannt") return "#d8c2a6"; // neutral beige
    return "#bca791"; // fallback neutral
}

let chartTooltip = null;
function getChartTooltip() {
    if (!chartTooltip) {
        chartTooltip = d3.select("body")
            .append("div")
            .attr("class", "map-tooltip") // Reuse existing style
            .style("opacity", 0);
    }
    return chartTooltip;
}

// Tätigkeiten: Häufigkeit der Unfälle (Top-N) in der Schweiz
function renderTrendChart(data) {
    const container = document.getElementById("trend-container");
    if (!container) return;

    const wrapTickText = (selection, maxChars = 18) => {
        selection.each(function() {
            const textSel = d3.select(this);
            const words = (textSel.text() || "").split(/\s+/).filter(Boolean);
            if (words.join(" ").length <= maxChars) return;

            const x = textSel.attr("x") || 0;
            const y = textSel.attr("y") || 0;
            const dy = parseFloat(textSel.attr("dy")) || 0;
            const lineHeight = 0.95;

            textSel.text(null);
            let line = [];
            let lineNumber = 0;
            let tspan = textSel.append("tspan")
                .attr("x", x)
                .attr("y", y)
                .attr("dy", dy + "em");

            words.forEach(word => {
                const candidate = [...line, word].join(" ");
                if (candidate.length > maxChars && line.length > 0) {
                    tspan.text(line.join(" "));
                    line = [word];
                    tspan = textSel.append("tspan")
                        .attr("x", x)
                        .attr("y", y)
                        .attr("dy", (++lineNumber * lineHeight + dy) + "em")
                        .text(word);
                } else {
                    line.push(word);
                    tspan.text(line.join(" "));
                }
            });
        });
    };

    const byActivity = d3.rollups(
        data,
        v => d3.sum(v, d => d.anzahl),
        d => d.taetigkeit || "Unbekannt"
    )
        .map(([taetigkeit, sum]) => ({ taetigkeit, sum }))
        .filter(d => d.sum > 0)
        .sort((a, b) => d3.descending(a.sum, b.sum))
        .sort((a, b) => d3.descending(a.sum, b.sum)); // Alle Tätigkeiten anzeigen

    if (byActivity.length === 0) {
        container.textContent = "Keine Daten vorhanden.";
        return;
    }

    container.innerHTML = ""; // Platzhalter entfernen

    // Bündiges SVG ohne Platzhalter-Padding
    container.classList.remove("chart-placeholder");
    container.classList.add("chart-surface");

    const { width, height } = getContainerSize(container, 600, 280);
    const margin = { top: 16, right: 20, bottom: 40, left: 190 };
    
    // Daten filtern (Top 6)
    const topData = byActivity.slice(0, 6);

    const computedHeight = Math.max(
        height,
        margin.top + margin.bottom + topData.length * 40
    );

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", computedHeight);

    const x = d3.scaleLinear()
        .domain([0, d3.max(topData, d => d.sum)]).nice()
        .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
        .domain(topData.map(d => d.taetigkeit))
        .range([margin.top, computedHeight - margin.bottom])
        .padding(0.18);

    const xAxis = g => g
        .attr("transform", `translate(0,${computedHeight - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5))
        .style("font-size", "11px");

    const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y))
        .style("font-size", "11px")
        .selectAll("text")
        .attr("dy", "0.35em")
        .call(wrapTickText, 18);

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    const tooltip = getChartTooltip();

    const selectedActivity = window.getSelectedActivity ? window.getSelectedActivity() : "all";

    svg.append("g")
        .selectAll("rect")
        .data(topData)
        .enter()
        .append("rect")
        .attr("x", x(0))
        .attr("y", d => y(d.taetigkeit))
        .attr("width", d => x(d.sum) - x(0))
        .attr("height", y.bandwidth())
        .attr("fill", "#c98042")
        .attr("opacity", d => (selectedActivity === "all" || selectedActivity === d.taetigkeit) ? 1 : 0.3)
        .on("click", function(event, d) {
            if (window.toggleActivityFilter) {
                window.toggleActivityFilter(d.taetigkeit);
            }
        })
        .on("mouseover", function(event, d) {
            // Dim all bars
            svg.selectAll("rect").attr("opacity", 0.3);
            // Highlight current
            d3.select(this).attr("fill", "#b66f34").attr("opacity", 1);
            
            tooltip.style("opacity", 1)
                .html(`<strong>${d.taetigkeit}</strong><br>${d.sum.toLocaleString("de-CH")} Unfälle`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
            
            d3.select(this).style("cursor", "pointer");
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("fill", "#c98042");
            // Restore opacity based on selection
            const currentSelected = window.getSelectedActivity ? window.getSelectedActivity() : "all";
            svg.selectAll("rect").attr("opacity", d => 
                (currentSelected === "all" || currentSelected === d.taetigkeit) ? 1 : 0.3
            );
            tooltip.style("opacity", 0);
        });
}
