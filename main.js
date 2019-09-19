const DEBUG = false;
const DEFAULT_LABEL = "Kafka Streams Topology";
const DISPLAY_TYPE_D3 = "d3";
const DISPLAY_TYPE_STANDARD = "std";
const DEFAULT_DISPLAY_TYPE = DISPLAY_TYPE_STANDARD;
const STORAGE_KEY = 'kafka-streams-topology-visualization';

let _data = {};
var _displayType = DEFAULT_DISPLAY_TYPE;
var _pending;

function changeDisplayType() {
	_displayType = displayType.value;
	_data.displayType = _displayType;
	store();

	scheduleUpdate();
}

function clear() {
	label.value = '';
	input.value = '';
	scheduleUpdate();
}

/**
 * @author zz85 (https://github.com/zz85 | https://twitter.com/blurspline)
 */
// converts kafka stream ascii topology description to DOT language
function convertTopologyToDot(topology, label) {
	let lines = topology.split('\n');
	let results = [];
	let outside = [];
	let stores = new Set();
	let topics = new Set();
	let entityName;

	// dirty but quick parsing
	let sub;
	let match;
	lines.forEach(line => {
		sub = /Sub-topology: ([0-9]*)/;
		match = sub.exec(line);

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
			entityName = convertTopologyToDotProcessName(match[2]);
			let type = match[3]; // source, processor or sink
			let linkedNames = match[4];
			linkedNames = linkedNames.replace(/\[|\]/g, '');
			linkedNames.split(',').forEach(linkedName => {
				linkedName = convertTopologyToDotProcessName(linkedName.trim());

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
			let targets = match[1];
			let linkedName;
			targets.split(',').forEach(name => {
				linkedName = convertTopologyToDotProcessName(name.trim());
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
	label = ` + label + `

	${results.join('\n')}
}
	`;
}

function convertTopologyToDotProcessName(name) {
	return name.replace(/-/g, '-\\n');
}

function initialize() {
	read();

	let topology = _data.topology;
	if (!topology || (topology === "")) {
		reset();
		return;
	}
	
	let labelValue = _data.label;
	if (!labelValue || (labelValue === ""))
		labelValue = '';
		
	let displayTypeValue = _data.displayType;
	if (!displayTypeValue || (displayTypeValue === ""))
		displayTypeValue = DEFAULT_DISPLAY_TYPE;

	displayType.value = displayTypeValue;
	input.value = topology;
	label.value = labelValue;
}

function read() {
	let data = sessionStorage.getItem(STORAGE_KEY);
	try {
		_data = JSON.parse(data);
	}
	catch (ex) {
	}

	if (!_data) {
		_data = {
			displayType: DEFAULT_DISPLAY_TYPE,
			label: DEFAULT_LABEL,
			topology: null
		};
	}
}

function reset() {
	let defaultTopology = `
Topology
Sub-topologies:
Sub-topology: 0
	Source:  KSTREAM-SOURCE-0000000000 (topics: [conversation-meta])
	--> KSTREAM-TRANSFORM-0000000001
	Processor: KSTREAM-TRANSFORM-0000000001 (stores: [conversation-meta-state])
	--> KSTREAM-KEY-SELECT-0000000002
	<-- KSTREAM-SOURCE-0000000000
	Processor: KSTREAM-KEY-SELECT-0000000002 (stores: [])
	--> KSTREAM-FILTER-0000000005
	<-- KSTREAM-TRANSFORM-0000000001
	Processor: KSTREAM-FILTER-0000000005 (stores: [])
	--> KSTREAM-SINK-0000000004
	<-- KSTREAM-KEY-SELECT-0000000002
	Sink: KSTREAM-SINK-0000000004 (topic: count-resolved-repartition)
	<-- KSTREAM-FILTER-0000000005
Sub-topology: 1
	Source: KSTREAM-SOURCE-0000000006 (topics: [count-resolved-repartition])
	--> KSTREAM-AGGREGATE-0000000003
	Processor: KSTREAM-AGGREGATE-0000000003 (stores: [count-resolved])
	--> KTABLE-TOSTREAM-0000000007
	<-- KSTREAM-SOURCE-0000000006
	Processor: KTABLE-TOSTREAM-0000000007 (stores: [])
	--> KSTREAM-SINK-0000000008
	<-- KSTREAM-AGGREGATE-0000000003
	Sink: KSTREAM-SINK-0000000008 (topic: streams-count-resolved)
	<-- KTABLE-TOSTREAM-0000000007
`;

	input.value = defaultTopology;
	label.value = DEFAULT_LABEL;
}

function renderDisplayTypeD3(dotCode) {
	while(output.firstChild && output.removeChild(output.firstChild));
	d3.select("#output").graphviz()
		.fade(false)
		.renderDot(dotCode);
}

function renderDisplayTypeStandard(dotCode) {
	while(output.firstChild && output.removeChild(output.firstChild));
	let params = {
		engine: 'dot',
		format: 'svg'
	};

	graphviz_code.value = dotCode;
	output.innerHTML = Viz(dotCode, params);
}

function scheduleUpdate() {
	if (_pending)
		clearTimeout(_pending);

	_pending = setTimeout(() => {
		_pending = null;
		update();
	}, 200);
}

function store() {
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_data));
}

function storeDisplayType(value) {
	_data.displayType = value;
	store();
}

function update() {
	let labelValue = label.value;
	if (!labelValue || (labelValue === '')) 
		labelValue = '';
	let topology = input.value;
	if (!topology || (topology === '')) 
		topology = '';

	let dotCode = convertTopologyToDot(topology, labelValue);
	if (DEBUG)
		console.log('dot code\n', dotCode);

	try {
		switch (_displayType) {
			case DISPLAY_TYPE_D3:
				renderDisplayTypeD3(dotCode);
				break;
			default:
				renderDisplayTypeStandard(dotCode);
				break;
		}

		_data.label = labelValue;
		_data.topology = topology;
		store();
	}
	catch (e) {
		console.error('Exception generating graph', e && e.stack || e);
		// TODO update Frontend
	}
}

// startup
initialize();
scheduleUpdate();
