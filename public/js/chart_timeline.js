// chart_timeline.js
// Zeigt den zeitlichen Verlauf der Unfälle (Area Chart) mit Brushing-Funktion

function renderTimeline(data, currentYearRange) {
    const container = document.getElementById("timeline-container");
    if (!container) return;

    // Aggregation nach Jahr
    const accidentsByYear = d3.rollups(
        data,
        v => d3.sum(v, d => d.anzahl),
        d => d.jahr
    )
    .map(([jahr, anzahl]) => ({ jahr, anzahl }))
    .sort((a, b) => a.jahr - b.jahr);

    if (accidentsByYear.length === 0) {
        container.textContent = "Keine Daten für den Zeitverlauf.";
        return;
    }

    container.innerHTML = "";
    container.classList.remove("chart-placeholder");
    container.classList.add("chart-surface");

    // Dimensionen
    const rect = container.getBoundingClientRect();
    const margin = { top: 10, right: 30, bottom: 30, left: 50 };
    
    // Responsive SVG Width
    const svgWidth = rect.width - 20;
    const width = svgWidth - margin.left - margin.right;
    const height = rect.height - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append("svg")
        .attr("viewBox", `0 0 ${svgWidth} ${rect.height - 10}`)
        .attr("width", "100%")
        .attr("height", "auto")
        .style("overflow", "visible")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Skalen
    const x = d3.scaleLinear()
        .domain(d3.extent(accidentsByYear, d => d.jahr))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(accidentsByYear, d => d.anzahl) * 1.1])
        .range([height, 0]);

    // Area Generator
    const area = d3.area()
        .x(d => x(d.jahr))
        .y0(height)
        .y1(d => y(d.anzahl))
        .curve(d3.curveMonotoneX);

    // Area zeichnen
    svg.append("path")
        .datum(accidentsByYear)
        .attr("fill", "#e8c8a4")
        .attr("stroke", "#c98042")
        .attr("stroke-width", 2)
        .attr("d", area);

    // Achsen
    const xAxisGroup = svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(accidentsByYear.length));

    svg.append("g")
        .call(d3.axisLeft(y).ticks(5));

    // Brush
    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("end", brushed);

    const brushGroup = svg.append("g")
        .attr("class", "brush")
        .call(brush);

    // Initial Brush Selection setzen (falls vorhanden)
    if (currentYearRange && currentYearRange.from && currentYearRange.to) {
        let startX = x(currentYearRange.from);
        let endX = x(currentYearRange.to);

        // Falls Start == Ende (Einzeljahr), machen wir den Brush künstlich etwas breiter
        // damit man ihn sieht (z.B. +/- 0.3 Jahre)
        if (currentYearRange.from === currentYearRange.to) {
             const center = startX;
             const widthPx = 10; // Pixel Breite des Handles
             startX = center - widthPx / 2;
             endX = center + widthPx / 2;
        }
        
        if (!isNaN(startX) && !isNaN(endX)) {
             brushGroup.call(brush.move, [startX, endX]);
        }
    }

    // --- Tooltip Logic ---
    let tooltip = document.querySelector(".timeline-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.className = "timeline-tooltip";
        tooltip.style.opacity = 0;
        document.body.appendChild(tooltip);
    }

    // Focus elements (hidden by default)
    const focus = svg.append("g")
        .style("display", "none")
        .style("pointer-events", "none"); // Don't block brush

    focus.append("line")
        .attr("y1", 0)
        .attr("y2", height) // Full height line
        .attr("stroke", "#d3bda2")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 2");

    focus.append("circle")
        .attr("r", 5)
        .attr("fill", "#c98042")
        .attr("stroke", "#fffaf3")
        .attr("stroke-width", 2);

    // Attach listeners to the brush overlay (captured events)
    // Use setTimeout to ensure the overlay rect exists after brush creation
    brushGroup.selectAll(".overlay")
        .on("mouseover", () => focus.style("display", null))
        .on("mouseout", () => {
            focus.style("display", "none");
            tooltip.style.opacity = 0;
        })
        .on("mousemove", function(event) {
            const [mx] = d3.pointer(event);
            const year = Math.round(x.invert(mx));
            
            // Find data
            const d = accidentsByYear.find(item => item.jahr === year);
            if (d) {
                const cx = x(d.jahr);
                const cy = y(d.anzahl);

                focus.attr("transform", `translate(${cx},0)`);
                focus.select("circle").attr("cy", cy);
                
                tooltip.style.opacity = 1;
                tooltip.innerHTML = `<strong>${d.jahr}</strong><br>${d.anzahl.toLocaleString("de-CH")} Unfälle`;
                
                // Position
                let left = event.pageX + 15;
                let top = event.pageY - 15;
                
                // Edge check (simple)
                if (left > window.innerWidth - 150) left = event.pageX - 160;

                tooltip.style.left = left + "px";
                tooltip.style.top = top + "px";
            } else {
                focus.style("display", "none");
                tooltip.style.opacity = 0;
            }

        });

    // --- Axis Tooltip Logic ---
    xAxisGroup.selectAll(".tick text")
        .style("cursor", "pointer")
        .on("mouseover", (event, year) => {
            // 'year' is the datum bound to the tick
            focus.style("display", null);
            
            const d = accidentsByYear.find(item => item.jahr === year);
            if (d) {
                const cx = x(d.jahr);
                const cy = y(d.anzahl);

                focus.attr("transform", `translate(${cx},0)`);
                focus.select("circle").attr("cy", cy);
                
                tooltip.style.opacity = 1;
                tooltip.innerHTML = `<strong>${d.jahr}</strong><br>${d.anzahl.toLocaleString("de-CH")} Unfälle`;
                
                let left = event.pageX + 15;
                let top = event.pageY - 15;
                if (left > window.innerWidth - 150) left = event.pageX - 160;
                tooltip.style.left = left + "px";
                tooltip.style.top = top + "px";
            }
        })
        .on("mouseout", () => {
            focus.style("display", "none");
            tooltip.style.opacity = 0;
        });

    function brushed(event) {
        // Wenn die Auswahl durch Code gesetzt wurde (sourceEvent ist null), nichts tun
        // um Endlosschleifen zu vermeiden
        if (!event.sourceEvent) return;

        if (!event.selection) {
            // Wenn Brush gelöscht wurde (Klick ohne Drag?) -> Einzeljahr selektieren
            // Wir prüfen, wo geklickt wurde
            // event.sourceEvent ist das MouseEvent (mouseup/click)
            const [mx] = d3.pointer(event.sourceEvent, svg.select(".overlay").node());
            const year = Math.round(x.invert(mx));
            
            // Callback an main.js (Start = Ende = clicked Year)
            if (window.updateYearRangeFromBrush) {
                window.updateYearRangeFromBrush(year, year);
            }
            return; 
        }

        const [x0, x1] = event.selection;
        const startYear = Math.round(x.invert(x0));
        const endYear = Math.round(x.invert(x1));

        // Callback an main.js
        if (window.updateYearRangeFromBrush) {
            window.updateYearRangeFromBrush(startYear, endYear);
        }
    }
}
