// chart_timeline.js
// Shows the temporal progression of accidents (Area Chart) with brushing function

function renderTimeline(data, currentYearRange) {
    const container = document.getElementById("timeline-container");
    if (!container) return;

    // Aggregation by year
    const rollup = d3.rollups(
        data,
        v => d3.sum(v, d => d.anzahl),
        d => d.jahr
    );
    const dataMap = new Map(rollup);

    // Determine range (Global preferred)
    let minYear, maxYear;
    if (currentYearRange && currentYearRange.min && currentYearRange.max) {
        minYear = currentYearRange.min;
        maxYear = currentYearRange.max;
    } else {
        const years = data.map(d => d.jahr);
        minYear = d3.min(years);
        maxYear = d3.max(years);
    }

    // Zero-filling for all years in range
    const accidentsByYear = [];
    if (minYear !== undefined && maxYear !== undefined) {
        for (let y = minYear; y <= maxYear; y++) {
            accidentsByYear.push({
                jahr: y,
                anzahl: dataMap.get(y) || 0
            });
        }
    }

    if (accidentsByYear.length === 0) {
        container.textContent = "Keine Daten für den Zeitverlauf.";
        return;
    }

    container.innerHTML = "";
    container.classList.remove("chart-placeholder");
    container.classList.add("chart-surface");

    // Dimensions
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

    // Scales
    // X-Domain fix: Use global min/max if available to keep axis stable for brushing
    let xDomain = d3.extent(accidentsByYear, d => d.jahr);
    if (currentYearRange && currentYearRange.min && currentYearRange.max) {
        xDomain = [currentYearRange.min, currentYearRange.max];
    }

    const x = d3.scaleLinear()
        .domain(xDomain)
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

    // Draw area
    svg.append("path")
        .datum(accidentsByYear)
        .attr("fill", "#e8c8a4")
        .attr("stroke", "#c98042")
        .attr("stroke-width", 2)
        .attr("d", area);

    // Axes
    const xAxisGroup = svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(accidentsByYear.length));

    svg.append("g")
        .call(d3.axisLeft(y).ticks(5));

    // Brush
    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("start brush end", brushed);

    const brushGroup = svg.append("g")
        .attr("class", "brush")
        .call(brush);

    // Custom Brush Handles (visible hooks)
    const handleWidth = 9;
    const handleHeight = 24;

    const brushHandles = brushGroup.selectAll(".handle-custom")
        .data([{type: "w"}, {type: "e"}])
        .enter().append("rect")
        .attr("class", "handle-custom")
        .attr("width", handleWidth)
        .attr("height", handleHeight)
        .attr("rx", 3)
        .attr("ry", 3)
        .attr("fill", "#c98042")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .attr("x", -handleWidth / 2) 
        .attr("y", (height - handleHeight) / 2) 
        .style("pointer-events", "none") // Let default overlay handle events
        .style("display", "none"); // Hidden initially until updated

    // Set initial brush selection
    if (currentYearRange && currentYearRange.from && currentYearRange.to) {
        let startX = x(currentYearRange.from);
        let endX = x(currentYearRange.to);

        // If Start == End (Single Year), artificially widen the brush so it is visible (e.g. +/- 5px)
        if (currentYearRange.from === currentYearRange.to) {
             const center = startX;
             const widthPx = 10; 
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
        const selection = event.selection;

        // 1. Update Custom Handles Position
        if (selection) {
            brushGroup.selectAll(".handle-custom")
                .style("display", null)
                .attr("transform", (d, i) => `translate(${selection[i]}, 0)`);
        } else {
            brushGroup.selectAll(".handle-custom").style("display", "none");
        }

        // 2. Logic: If selection was set by code (sourceEvent is null), do nothing to avoid infinite loops
        if (!event.sourceEvent) return;

        // 3. Only trigger main update on 'end' to avoid performance issues
        if (event.type !== "end") return;

        if (!event.selection) {
            // If brush was cleared (click without drag?) -> Select single year.
            // Check where clicked.
            // event.sourceEvent is the MouseEvent (mouseup/click)
            const [mx] = d3.pointer(event.sourceEvent, svg.select(".overlay").node());
            const year = Math.round(x.invert(mx));
            
            // Callback to main.js (Start = End = clicked Year)
            if (window.updateYearRangeFromBrush) {
                window.updateYearRangeFromBrush(year, year);
            }
            return; 
        }

        const [x0, x1] = event.selection;
        const startYear = Math.round(x.invert(x0));
        const endYear = Math.round(x.invert(x1));

        // Callback to main.js
        if (window.updateYearRangeFromBrush) {
            window.updateYearRangeFromBrush(startYear, endYear);
        }
    }
}
