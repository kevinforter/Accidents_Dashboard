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
    svg.append("g")
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
        // Nur wenn der Range NICHT dem vollen Umfang entspricht, zeigen wir den Brush an?
        // Oder immer? Immer ist besser für Konsistenz.
        const startX = x(currentYearRange.from);
        const endX = x(currentYearRange.to);
        
        // Prüfen ob valide
        if (!isNaN(startX) && !isNaN(endX)) {
             brushGroup.call(brush.move, [startX, endX]);
        }
    }

    function brushed(event) {
        // Wenn die Auswahl durch Code gesetzt wurde (sourceEvent ist null), nichts tun
        // um Endlosschleifen zu vermeiden
        if (!event.sourceEvent) return;

        if (!event.selection) {
            // Wenn Brush gelöscht wurde -> Alles auswählen?
            // Optional: Reset auf min/max
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
