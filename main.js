/**
 * @author zz85 (https://github.com/zz85 | https://twitter.com/blurspline)
 */

const DEBUG = false;
const STORAGE_KEY = 'kafka-streams-viz';

function processName(name) {
	return name.replace(/-/g, '-\\n');
}

// converts kafka stream ascii topo description to DOT language
function convertTopoToDot(topo) {
	var lines = topo.split('\n');
	var results = [];
	var outside = [];
	var stores = new Set();
	var topics = new Set();
	var entityName;

	// dirty but quick parsing
	lines.forEach(line => {
		var sub = /Sub-topology: ([0-9]*)/;
		var match = sub.exec(line);

		if (match) {
			if (results.length) 
				results.push(`}`);
				
			results.push(`subgraph cluster_${match[1]} {
	label = "${match[0]}";

	style=filled;
	color=lightgrey;
	node [style=filled,color=white];
	`);

			return;
		}

		match = /(Source\:|Processor\:|Sink:)\s+(\S+)\s+\((topics|topic|stores)\:(.*)\)/.exec(line)

		if (match) {
			entityName = processName(match[2]);
			var type = match[3]; // source, processor or sink
			var linkedNames = match[4];
			linkedNames = linkedNames.replace(/\[|\]/g, '');
			linkedNames.split(',').forEach(linkedName => {
				linkedName = processName(linkedName.trim());

				if (linkedName === '') {
					// short circuit
				}
				else if (type === 'topics') {
					// from
					outside.push(`"${linkedName}" -> "${entityName}";`);
					topics.add(linkedName);
				}
				else if (type === 'topic') {
					// to
					outside.push(`"${entityName}" -> "${linkedName}";`);
					topics.add(linkedName);
				}
				else if (type === 'stores') {
					outside.push(`"${entityName}" -> "${linkedName}";`);
					stores.add(linkedName);
				}
			});

			return;
		}

		match = /\-\-\>\s+(.*)$/.exec(line);

		if (match && entityName) {
			var targets = match[1];
			targets.split(',').forEach(name => {
				var linkedName = processName(name.trim());
				if (linkedName === 'none') 
					return;

				results.push(`"${entityName}" -> "${linkedName}";`);
			});
		}
	})

	if (results.length) 
		results.push(`}`);

	results = results.concat(outside);

	stores.forEach(node => {
		results.push(`"${node}" [shape=cylinder];`)
	});

	topics.forEach(node => {
		results.push(`"${node}" [shape=rect];`)
	});

	return `
digraph G {
	label = "Kafka Streams Topology"

	${results.join('\n')}
}
`;
}

function update() {
	var topo = input.value;
	var dotCode = convertTopoToDot(topo);
	if (DEBUG)
		console.log('dot code\n', dotCode);

	var params = {
		engine: 'dot',
		format: 'svg'
  	};
  	
	try {
		graphviz_code.value = dotCode;
		svg_container.innerHTML = Viz(dotCode, params);
	    
		sessionStorage.setItem(STORAGE_KEY, topo);
	}
	catch (e) {
		console.error('Exception generating graph', e && e.stack || e);
		// TODO update Frontend
	}
}

// startup
var topo;
if (!topo)
	topo = sessionStorage.getItem(STORAGE_KEY);

if (topo) 
	input.value = topo;
update();
