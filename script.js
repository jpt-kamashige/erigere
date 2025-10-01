// Mind Map Tool Script

document.addEventListener('DOMContentLoaded', () => {
    const svg = d3.select("#mindmap-canvas");
    const width = +svg.node().getBoundingClientRect().width;
    const height = +svg.node().getBoundingClientRect().height;

    const nodeWidth = 200;
    const nodeHeight = 80;

    // --- Local Storage ---
    const STORAGE_KEY = 'mindmap-data';

    function saveData() {
        // When saving links, D3 might have replaced the ID with the node object.
        // We need to store only the IDs.
        const storableLinks = links.map(l => ({
            source: l.source.id,
            target: l.target.id
        }));
        const data = {
            nodes: nodes,
            links: storableLinks,
            nextNodeId: nextNodeId
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function loadData() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                // We need to re-hydrate the links with references to the actual node objects
                const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
                data.links = data.links.map(l => ({
                    source: nodeMap.get(l.source),
                    target: nodeMap.get(l.target)
                })).filter(l => l.source && l.target); // Filter out broken links
                return data;
            } catch (e) {
                console.error("Error loading data from local storage", e);
                return null;
            }
        }
        return null;
    }

    // --- Data ---
    const initialData = loadData();
    let nodes = initialData ? initialData.nodes : [{ id: 1, name: '中心トピック' }];
    let links = initialData ? initialData.links : [];
    let nextNodeId = initialData ? initialData.nextNodeId : 2;
    let selectedNode = null;

    // --- D3 Force Simulation ---
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(300))
        .force("charge", d3.forceManyBody().strength(-1500))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .on("tick", ticked);

    // --- SVG Element Groups ---
    let linkGroup = svg.append("g").attr("class", "links");
    let nodeGroup = svg.append("g").attr("class", "nodes");

    // --- Deselect on background click ---
    svg.on('click', () => {
        selectNode(null);
    });

    function wrapText(selection, width) {
        selection.each(function() {
            const text = d3.select(this);
            const fullText = text.text();
            const chars = fullText.split('');
            let line = '';
            let lines = [];
            const lineHeight = 1.1; // ems
            const maxLines = 2;

            // Use a temporary tspan to measure text width as we build it
            let tspan = text.text(null).append("tspan");

            for (let i = 0; i < chars.length; i++) {
                const testLine = line + chars[i];
                tspan.text(testLine);
                if (tspan.node().getComputedTextLength() > width && line.length > 0) {
                    lines.push(line);
                    line = chars[i];
                } else {
                    line = testLine;
                }
            }
            lines.push(line);
            tspan.remove();

            // Truncate lines if necessary
            if (lines.length > maxLines) {
                const firstLine = lines[0];
                let secondLine = lines[1];

                let tempTspan = text.append("tspan").text(secondLine + "...");
                while (tempTspan.node().getComputedTextLength() > width && secondLine.length > 0) {
                    secondLine = secondLine.slice(0, -1);
                    tempTspan.text(secondLine.trim() + "...");
                }
                lines = [firstLine, tempTspan.text()];
                tempTspan.remove();
            }

            // Now render the final lines
            text.text(null);
            const numLines = lines.length;
            const startDy = -((numLines - 1) / 2) * lineHeight;

            for (let i = 0; i < numLines; i++) {
                text.append("tspan")
                    .attr("x", 0)
                    .attr("dy", (i === 0 ? startDy : lineHeight) + "em")
                    .text(lines[i]);
            }
        });
    }

    // --- Update Function ---
    function update() {
        // Nodes
        const nodeElements = nodeGroup.selectAll("g.node-group")
            .data(nodes, d => d.id)
            .join(
                enter => {
                    const nodeGroup = enter.append("g")
                        .attr("class", "node-group")
                        .attr("data-id", d => d.id);

                    nodeGroup.append("rect")
                        .attr("class", "node")
                        .attr("width", nodeWidth)
                        .attr("height", nodeHeight)
                        .attr("x", -nodeWidth / 2)
                        .attr("y", -nodeHeight / 2)
                        .attr("rx", 10)
                        .attr("fill", "#aef");

                    nodeGroup.append("text"); // Append empty text, wrapText will handle it

                    return nodeGroup;
                },
                update => { // Handle text updates
                    // No need to do anything here, will be handled below
                    return update;
                }
            );

        // Update text content and apply wrapping for both enter and update selections
        nodeElements.select('text')
            .text(d => d.name)
            .call(wrapText, nodeWidth - 20); // Apply wrap with padding

        // Apply handlers
        nodeElements
            .on('click', handleClick)
            .on('dblclick', handleDblClick)
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        // Links
        const linkElements = linkGroup.selectAll("line.link")
            .data(links, d => `${d.source.id}-${d.target.id}`)
            .join("line")
            .attr("class", "link");

        // Restart simulation
        simulation.nodes(nodes);
        simulation.force("link").links(links);
        simulation.alpha(1).restart();

        saveData();
    }

    // --- Selection ---
    function selectNode(node) {
        selectedNode = node;
        nodeGroup.selectAll('rect.node')
            .classed('selected', d => selectedNode && d.id === selectedNode.id);
    }

    // --- Event Handlers & Dragging ---
    function handleDblClick(event, d) {
        event.stopPropagation(); // Stop propagation to avoid triggering other events like drag

        // Fix the position of all existing nodes to prevent them from moving
        nodes.forEach(node => {
            node.fx = node.x;
            node.fy = node.y;
        });

        const newNode = { id: nextNodeId++, name: '新しいノード', x: d.x, y: d.y };
        nodes.push(newNode);
        links.push({ source: d.id, target: newNode.id });
        selectNode(newNode); // Select the new node
        update();
    }

    function handleClick(event, d) {
        event.stopPropagation();
        selectNode(d);
    }

    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        // Keep the node fixed at its position after dragging
        d.fx = d.x;
        d.fy = d.y;
    }

    // --- Ticked Function ---
    function ticked() {
        linkGroup.selectAll("line.link")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        nodeGroup.selectAll("g.node-group")
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }

    // --- Initial Render ---
    update();

    // --- Keyboard Handlers ---
    d3.select(window).on('keydown', (event) => {
        if (!selectedNode) return;

        switch (event.key) {
            case 'Enter':
                event.preventDefault(); // Prevent form submission or other default behavior
                const newName = prompt('新しいノード名を入力してください:', selectedNode.name);
                if (newName !== null && newName.trim() !== '') {
                    selectedNode.name = newName.trim();
                    update();
                }
                break;

            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                if (selectedNode.id === 1) {
                    alert('中心トピックは削除できません。');
                    return;
                }

                // Remove node and connected links
                nodes = nodes.filter(n => n.id !== selectedNode.id);
                links = links.filter(l => l.source.id !== selectedNode.id && l.target.id !== selectedNode.id);

                selectNode(null);
                update();
                break;
        }
    });
});