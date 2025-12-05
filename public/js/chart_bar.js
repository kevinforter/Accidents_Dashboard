// Hilfsfunktion: Breite des Containers bestimmen
function getContainerSize(container, defaultWidth = 600, defaultHeight = 260) {
    const rect = container.getBoundingClientRect();
    const width = rect.width && rect.width > 0 ? rect.width : defaultWidth;
    const height = rect.height && rect.height > 0 ? rect.height : defaultHeight;
    return { width, height };
}

// Balkendiagramm: Unfälle nach Kanton (Top 10, absolute Werte)
function renderBarChart(data) {
    const container = document.getElementById("bar-container");
    if (!container) return;

    const byCanton = d3.rollups(
        data,
        v => d3.sum(v, d => d.anzahl),
        d => d.kanton
    )
        .map(([kanton, sum]) => ({ kanton, sum }))
        .sort((a, b) => d3.descending(a.sum, b.sum))
        .slice(0, 10);

    if (byCanton.length === 0) {
        container.textContent = "Keine Daten vorhanden.";
        return;
    }

    container.innerHTML = ""; // Platzhalter entfernen

    // Wenn die Karte geladen wurde, soll das Diagramm bündig ohne Padding sitzen
    container.classList.remove("chart-placeholder");
    container.classList.add("chart-surface");

    const { width, height } = getContainerSize(container, 600, 260);
    const margin = { top: 20, right: 15, bottom: 80, left: 70 };

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleBand()
        .domain(byCanton.map(d => d.kanton))
        .range([margin.left, width - margin.right])
        .padding(0.25);

    const y = d3.scaleLinear()
        .domain([0, d3.max(byCanton, d => d.sum)]).nice()
        .range([height - margin.bottom, margin.top]);

    const xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-50)")
        .style("text-anchor", "end")
        .style("font-size", "11px");

    const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(6))
        .style("font-size", "11px");

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    svg.append("g")
        .selectAll("rect")
        .data(byCanton)
        .enter()
        .append("rect")
        .attr("x", d => x(d.kanton))
        .attr("y", d => y(d.sum))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d.sum))
        .attr("fill", "#c98042")
        .append("title")
        .text(d => `${d.kanton}: ${d.sum.toLocaleString("de-CH")} Unfälle`);
}

// Liniendiagramm: Gesamt-Unfälle pro Jahr (absolute Werte)
function renderTrendChart(data) {
    const container = document.getElementById("trend-container");
    if (!container) return;

    const byYear = d3.rollups(
        data,
        v => d3.sum(v, d => d.anzahl),
        d => d.jahr
    )
        .map(([jahr, sum]) => ({ jahr, sum }))
        .sort((a, b) => d3.ascending(a.jahr, b.jahr));

    if (byYear.length === 0) {
        container.textContent = "Keine Daten vorhanden.";
        return;
    }

    container.innerHTML = ""; // Platzhalter entfernen

    // Bündiges SVG ohne Platzhalter-Padding
    container.classList.remove("chart-placeholder");
    container.classList.add("chart-surface");

    const { width, height } = getContainerSize(container, 600, 260);
    const margin = { top: 20, right: 20, bottom: 50, left: 70 };

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleLinear()
        .domain(d3.extent(byYear, d => d.jahr))
        .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(byYear, d => d.sum)]).nice()
        .range([height - margin.bottom, margin.top]);

    const xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6))
        .style("font-size", "11px");

    const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(6))
        .style("font-size", "11px");

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    const line = d3.line()
        .x(d => x(d.jahr))
        .y(d => y(d.sum))
        .curve(d3.curveMonotoneX);

    svg.append("path")
        .datum(byYear)
        .attr("fill", "none")
        .attr("stroke", "#c98042")
        .attr("stroke-width", 2)
        .attr("d", line);

    svg.selectAll("circle")
        .data(byYear)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.jahr))
        .attr("cy", d => y(d.sum))
        .attr("r", 3)
        .attr("fill", "#c98042");
}
