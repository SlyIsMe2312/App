

let network = null;
let nodes = null;
let edges = null;
let count = 1;
let clusterCount = 1;
let clusterEdge = 1;

function initializeNetwork() {
    nodes = new vis.DataSet();
    edges = new vis.DataSet(); 
    count = 1;
    clusterCount = 1;
    clusterEdge = 1;

    const container = document.getElementById('display-board'); 

    const options = {
        nodes: { shape: 'dot', size: 30 },
        edges: { smooth: true }
    };

    network = new vis.Network(
        container, 
        { 
            nodes: nodes, 
            edges: edges 
        }, options
    );

    network.on("click", function (params) {
        // Check if the click was on a node and if that node is a cluster
        if (params.nodes.length === 1) {
            const nodeId = params.nodes[0];
            if (network.clustering.isCluster(nodeId)) {
                // Open the cluster that was clicked
                network.clustering.openCluster(nodeId);
                console.log(`✅ Opened cluster: ${nodeId}`);
            }
        }
    });
}



function addNode(id, label) {
    nodes.add({ id: id, label: label });
    count++;
}
function addEdge(from, to) {
    edges.add({ from: from, to: to, arrows: 'to'});
}

function clusterNodes(nodeIds, clusterLabel = 'Cluster') {
    // Get the nodes data
    
    // Find the nodes to cluster
    const nodesToCluster = nodes.get().filter(n => nodeIds.includes(n.id));
    
    if (nodesToCluster.length === 0) {
        console.warn('No nodes found with those IDs');
        return;
    }
    
    // Create a unique ID for the cluster
    const clusterId = `cluster_${clusterCount++}`;
    
    // Cluster them using the joinCondition
    network.cluster({
        joinCondition: function(childOptions) {
            return nodeIds.includes(childOptions.id);
        },
        clusterNodeProperties: {
            id: clusterId,
            label: clusterLabel,
            color: '#FFD700',
            shape: 'dot',
            size: 40,
            borderWidth: 3,
            font: { color: '#000000', size: 16 }
        }
    });
    
    console.log(`✅ Clustered nodes: ${nodeIds.join(', ')}`);
}

function aggregateEdges(edgeIds) {
    // Get all edges to aggregate
    const allEdges = edges.get();
    const edgesToAggregate = allEdges.filter(e => edgeIds.includes(e.id));
    
    if (edgesToAggregate.length === 0) return;
    
    // Get from/to nodes (assuming all edges share same nodes)
    const fromNode = edgesToAggregate[0].from;
    const toNode = edgesToAggregate[0].to;
    
    // Remove individual edges
    edgeIds.forEach(id => edges.remove(id));
    
    // Add ONE edge with aggregated data
    edges.add({
        id: `aggregated_${Date.now()}`,
        from: fromNode,
        to: toNode,
        label: `${edgesToAggregate.length}x`,
        width: Math.min(10, 2 + edgesToAggregate.length * 0.5),
        // Store the original edge data
        originalEdges: edgesToAggregate,
        edgeCount: edgesToAggregate.length,
        // ⭐ This is the key - only ONE edge = ONE force
        physics: true
    });
}



function unclusterNode(clusterId) {
    if (network.clustering.isCluster(clusterId)) {
        network.clustering.openCluster(clusterId);
    }
}

document.addEventListener('DOMContentLoaded', (event) => {
    initializeNetwork();

})