// Hilfsfunktion: Breite des Containers bestimmen
function getContainerSize(container, defaultWidth = 600, defaultHeight = 260) {
    const rect = container.getBoundingClientRect();
    const width = rect.width && rect.width > 0 ? rect.width : defaultWidth;
    const height = rect.height && rect.height > 0 ? rect.height : defaultHeight;
    return { width, height };
}

// Geschlechterverteilung: relative Anteile (Donut)
function renderBarChart(data) {
    const container = document.getElementById("donut-container");
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

    const svgWidth = width - 10;
    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${svgWidth} ${height}`)
        .attr("width", "100%")
        .attr("height", "auto")
        .style("overflow", "visible");

    const centerX = svgWidth / 2;
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
            arcGroup.selectAll("path").attr("opacity", 0.6);
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
            // Restore opacity based on CLICKED state
            const clickedGender = window.getClickedGender ? window.getClickedGender() : null;
            arcGroup.selectAll("path").attr("opacity", d => 
                (clickedGender === null || clickedGender === d.data.geschlecht) ? 1 : 0.6
            );
            tooltip.style("opacity", 0);
        });

    // Set initial opacity based on CLICKED state (Soft Filter)
    const clickedGender = window.getClickedGender ? window.getClickedGender() : null;
    arcGroup.selectAll("path").attr("opacity", d => 
        (clickedGender === null || clickedGender === d.data.geschlecht) ? 1 : 0.6
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
    // Always top-right
    const legendX = width - 110;

    const legend = svg.append("g")
        .attr("transform", `translate(${legendX - 20}, -30)`);

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
    const container = document.getElementById("bar-container");
    if (!container) return;

    const wrapTickText = (selection, maxChars = 18) => {
        selection.each(function() {
            const textSel = d3.select(this);
            const words = (textSel.text() || "").split(/\s+/).filter(Boolean);
            
            // 1. Calculate lines (Simulation)
            const lines = [];
            let currentLine = [];
            
            words.forEach(word => {
                // Try appending
                if ([...currentLine, word].join(" ").length > maxChars && currentLine.length > 0) {
                    // Start new line
                    lines.push(currentLine.join(" "));
                    currentLine = [word];
                } else {
                    currentLine.push(word);
                }
            });
            if (currentLine.length > 0) lines.push(currentLine.join(" "));

            // If only 1 line and short enough (already checked outside?), just keep it? 
            // Actually the original check `words.join(" ").length <= maxChars` returns early.
            // But if we are here, we might have multiple lines OR one long line (if force break not implemented, but above logic breaks by word).
            // NOTE: The original logic returned early if total length <= maxChars. 
            // If we are here, we proceed.

            const x = textSel.attr("x") || 0;
            const y = textSel.attr("y") || 0;
            const originalDy = parseFloat(textSel.attr("dy")) || 0;
            const lineHeight = 0.95; // ems

            // 2. Clear content
            textSel.text(null);

            // 3. Calculate vertical start to center the block
            // Formula: originalDy - ( (totalLines - 1) * lineHeight / 2 )
            // Example: 2 lines -> shift up by 0.5 * lineHeight
            const totalLines = lines.length;
            const startDy = originalDy - ((totalLines - 1) * lineHeight / 2);

            // 4. Render
            lines.forEach((lineText, i) => {
                textSel.append("tspan")
                    .attr("x", x)
                    .attr("y", y)
                    .attr("dy", (i === 0 ? startDy : lineHeight) + "em") 
                    // Note: d3 tspan dy is relative to previous sibling if not absolute? 
                    // Wait, SVG dy is relative to previous position. 
                    // For the FIRST tspan, it is relative to 'y'. 
                    // For SUBSEQUENT tspans, 'dy' is relative to the previous line's baseline.
                    // So subsequent tspans should have dy=lineHeight.
                    // Ah, the original code used: (++lineNumber * lineHeight + dy) + "em"
                    // But that was because it was setting dy relative to the STARTING text position for EVERY tspan?
                    // No, "dy" attribute on tspan is additive relative to previous text content position.
                    // Actually, if x is specified (absolute), dy is relative to y? 
                    // SVG 1.1: "If a list of lengths is specified... relative to the previous text chunk".
                    // Standard d3 pattern often uses:
                    // tspan 0: dy = startDy
                    // tspan 1: dy = lineHeight (relative to tspan 0)
                    // tspan 2: dy = lineHeight (relative to tspan 1)
                    
                    // BUT, the original code used:
                    // tspan 0: dy + "em"
                    // tspan 1: (++line * lineHeight + dy) + "em"
                    // This implies the previous developer might have been using absolute-ish calculation?
                    // If 'y' attribute is set on each tspan (which it is: .attr("y", y)),
                    // then 'dy' is relative to 'y'.
                    // So we must use explicit offsets relative to y for ALL lines if we keep setting x and y.
                    // Yes, we are setting .attr("y", y).
                    
                    // So:
                    // Line i dy = startDy + (i * lineHeight)
                    .attr("dy", (startDy + (i * lineHeight)) + "em")
                    .text(lineText);
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
    const margin = { top: 15, right: 20, bottom: 15, left: 100 };
    
    // Daten filtern (Top 5)
    const topData = byActivity.slice(0, 5);

    const computedHeight = Math.max(
        height,
        margin.top + margin.bottom + topData.length * 40
    );

    const svgWidth = width - 10;
    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${svgWidth} ${computedHeight}`)
        .attr("width", "100%")
        .attr("height", "auto")
        .style("overflow", "visible");

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

    const clickedActivity = window.getClickedActivity ? window.getClickedActivity() : null;

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
        .attr("opacity", d => (clickedActivity === null || clickedActivity === d.taetigkeit) ? 1 : 0.3)
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
            // Restore opacity based on CLICKED state
            const currentClicked = window.getClickedActivity ? window.getClickedActivity() : null;
            svg.selectAll("rect").attr("opacity", d => 
                (currentClicked === null || currentClicked === d.taetigkeit) ? 1 : 0.3
            );
            tooltip.style("opacity", 0);
        });
}
