#!/usr/bin/env node
'use strict';

/**
 * Attribute the self time in one or more V8 `.cpuprofile` files (as written by `node --cpu-prof`) to the
 * layers of a cucumber-tsflow run: the tsflow library, CucumberJS, jsdom, Vue, esbuild, other dependencies,
 * Node internals, V8 pseudo-frames and the consumer's own code. Written for item 27 of the performance
 * worklist (research/performance-enhancement-execution-strategy.md), which asks where `runtime:run` goes.
 *
 *   node research/scripts/attribute-cpuprofile.js [options] <file.cpuprofile>...
 *
 * Options
 *   --all                 Attribute every sample. By default the window starts at the first sample whose
 *                         stack contains a frame matching --start-marker, which is where `runtime:run`
 *                         begins, and runs to the end of the profile.
 *   --start-marker=<re>   Regular expression tested against `functionName @ url` for every frame on the
 *                         stack (url with forward slashes). The default matches Coordinator.run, the serial
 *                         and parallel adapters' run, the worker's runBeforeAllHooks / runTestCase and the
 *                         TestCaseRunner methods, all under lib/runtime/ and all called only while the
 *                         runtime is running. `makeRuntime` itself is not usable: `runtime.run()` is called
 *                         after an await, so makeRuntime is never on the stack during the run.
 *   --from-ms=<n>         Explicit window start, milliseconds from the profile's first sample. Overrides
 *   --to-ms=<n>           the marker. --to-ms defaults to the end of the profile.
 *   --top=<n>             Rows in the hot-function tables (default 25).
 *   --json                Print one JSON object per profile instead of the tables.
 *
 * Attribution rules
 *   - Self time goes to the layer of the sampled frame's file. A frame with no url (a V8 builtin such as a
 *     regex exec, a sort, `readFileUtf8` or `compileFunctionForCJSLoader`) is charged to the nearest
 *     caller that has one, so a builtin called from tsflow counts as tsflow. The hot-function tables still
 *     name the builtin, so the split remains visible.
 *   - The two "inclusive" tables count a sample once for every package (any `node_modules` segment on the
 *     stack, whatever its layer) and every consumer file on its stack, so their rows overlap and do not add
 *     up to the window. They answer "how much of the run went through this package / this step file",
 *     which is the question the consumer's owner has.
 *   - `(idle)`, `(program)` and `(garbage collector)` stay separate. `(idle)` is the event loop waiting
 *     (I/O, timers, child processes, worker threads), so on a serial run it is time nobody's JavaScript
 *     was using.
 *   - `node --cpu-prof` writes one file per thread, named CPU.<date>.<time>.<pid>.<tid>.<seq>.cpuprofile;
 *     tid 0 is the main thread. Preload worker threads and the startup-progress spinner thread get their
 *     own files, which this script reads the same way (use --all for those; the marker never appears).
 *
 * No dependencies; Node 18 or later.
 */

const fs = require('node:fs');
const path = require('node:path');

const PSEUDO = new Set(['(program)', '(garbage collector)', '(idle)', '(root)']);
const JSDOM_PACKAGES = new Set([
	'jsdom',
	'parse5',
	'parse5-html-rewriting-stream',
	'nwsapi',
	'cssstyle',
	'rrweb-cssom',
	'tough-cookie',
	'saxes',
	'w3c-xmlserializer',
	'data-urls',
	'html-encoding-sniffer',
	'symbol-tree',
	'webidl-conversions',
	'whatwg-url',
	'whatwg-mimetype',
	'whatwg-encoding',
	'xml-name-validator',
	'decimal.js',
	'is-potential-custom-element-name',
	'@asamuzakjp/css-color',
	'@csstools/css-tokenizer',
	'@csstools/css-parser-algorithms',
	'@csstools/css-calc',
	'@csstools/color-helpers',
	'canvas',
	'ws'
]);
const VUE_PACKAGES = new Set([
	'vue',
	'@vue/runtime-core',
	'@vue/runtime-dom',
	'@vue/reactivity',
	'@vue/shared',
	'@vue/compiler-sfc',
	'@vue/compiler-dom',
	'@vue/compiler-core',
	'@vue/server-renderer',
	'@vue/test-utils',
	'@vue/devtools-api',
	'@testing-library/vue',
	'vuetify',
	'pinia',
	'vue-router',
	'@vueuse/core',
	'@vueuse/shared'
]);

function parseArgs(argv) {
	const opts = {
		files: [],
		all: false,
		startMarker:
			'^(run|runBeforeAllHooks|runTestCase|runAttempt|runHook|runStepHooks|runStep) @ .*/lib/runtime/(coordinator|worker|serial/adapter|parallel/adapter|test-case-runner)\\.js$',
		fromMs: undefined,
		toMs: undefined,
		top: 25,
		json: false
	};
	for (const arg of argv) {
		if (arg === '--all') opts.all = true;
		else if (arg === '--json') opts.json = true;
		else if (arg.startsWith('--start-marker=')) opts.startMarker = arg.slice('--start-marker='.length);
		else if (arg.startsWith('--from-ms=')) opts.fromMs = Number(arg.slice('--from-ms='.length));
		else if (arg.startsWith('--to-ms=')) opts.toMs = Number(arg.slice('--to-ms='.length));
		else if (arg.startsWith('--top=')) opts.top = Number(arg.slice('--top='.length));
		else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
		else opts.files.push(arg);
	}
	if (opts.files.length === 0) throw new Error('No .cpuprofile files given');
	opts.startMarker = new RegExp(opts.startMarker);
	return opts;
}

/** Package name (scoped or not) of the last `node_modules/` segment in a URL, or undefined. */
function packageOf(url) {
	const idx = url.lastIndexOf('node_modules/');
	if (idx < 0) return undefined;
	const rest = url.slice(idx + 'node_modules/'.length).split('/');
	return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
}

/**
 * Bucket a call frame by its file. Returns { bucket, detail } where detail refines the bucket for the
 * sub-tables (a package name for dependencies, a lib/ sub-directory for tsflow, a file for the consumer),
 * or undefined for a frame with no url, which the caller charges to the nearest ancestor that has one.
 */
function classify(frame) {
	const url = (frame.url || '').replace(/\\/g, '/');
	const fn = frame.functionName || '(anonymous)';
	if (!url) {
		if (PSEUDO.has(fn)) return { bucket: `v8 ${fn}`, detail: fn };
		return undefined;
	}
	if (url.startsWith('node:')) return { bucket: 'node internals', detail: url };
	if (/\/cucumber-js-tsflow\/cucumber-tsflow\/lib\//.test(url) || /\/@lynxwall\/cucumber-tsflow\//.test(url)) {
		const sub = url.match(/\/lib\/([^/]+?)(?:\.m?js)?(?:\/([^/]+))?(?:$|\?)/);
		let detail = 'lib';
		if (sub) detail = sub[1] === 'runtime' && sub[2] === 'parallel' ? 'lib/runtime/parallel' : `lib/${sub[1]}`;
		return { bucket: 'tsflow', detail };
	}
	const pkg = packageOf(url);
	if (pkg) {
		if (pkg.startsWith('@cucumber/')) return { bucket: 'cucumber-js', detail: pkg };
		if (JSDOM_PACKAGES.has(pkg)) return { bucket: 'jsdom', detail: pkg };
		if (VUE_PACKAGES.has(pkg)) return { bucket: 'vue', detail: pkg };
		if (pkg === 'esbuild' || pkg.startsWith('@esbuild/')) return { bucket: 'esbuild', detail: pkg };
		if (pkg === 'source-map-support' || pkg === 'source-map' || pkg === '@jridgewell/trace-mapping') {
			return { bucket: 'source maps', detail: pkg };
		}
		return { bucket: 'other dependencies', detail: pkg };
	}
	return { bucket: 'consumer', detail: url };
}

function frameKey(frame) {
	const url = (frame.url || '').replace(/\\/g, '/');
	const fn = frame.functionName || '(anonymous)';
	if (url) return `${fn}  ${url}:${frame.lineNumber + 1}`;
	return PSEUDO.has(fn) ? fn : `${fn}  (builtin)`;
}

function frameLabel(frame) {
	return `${frame.functionName || ''} @ ${(frame.url || '').replace(/\\/g, '/')}`;
}

function analyse(file, opts) {
	const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
	const nodes = new Map();
	for (const node of profile.nodes) nodes.set(node.id, node);
	const parent = new Map();
	for (const node of profile.nodes) for (const child of node.children || []) parent.set(child, node.id);

	const NO_CALLER = { bucket: 'builtin with no JS caller', detail: '(none)' };
	const classified = new Map();
	const classOf = id => {
		let c = classified.get(id);
		if (!c) {
			c = classify(nodes.get(id).callFrame);
			// A builtin frame is charged to the nearest ancestor that has a file.
			if (!c) c = parent.has(id) ? classOf(parent.get(id)) : NO_CALLER;
			classified.set(id, c);
		}
		return c;
	};
	const stackBuckets = new Map();
	const bucketsOnStack = id => {
		let set = stackBuckets.get(id);
		if (!set) {
			set = new Set(parent.has(id) ? bucketsOnStack(parent.get(id)) : []);
			set.add(classOf(id).bucket);
			stackBuckets.set(id, set);
		}
		return set;
	};
	// Packages (any node_modules segment) and consumer files anywhere on the stack, for the inclusive tables.
	const stackDetails = new Map();
	const detailsOnStack = id => {
		let d = stackDetails.get(id);
		if (!d) {
			const up = parent.has(id) ? detailsOnStack(parent.get(id)) : { packages: new Set(), files: new Set() };
			d = { packages: new Set(up.packages), files: new Set(up.files) };
			const frame = nodes.get(id).callFrame;
			const pkg = packageOf((frame.url || '').replace(/\\/g, '/'));
			if (pkg) d.packages.add(pkg);
			const c = classOf(id);
			if (c.bucket === 'consumer' && frame.url) d.files.add(c.detail);
			stackDetails.set(id, d);
		}
		return d;
	};
	const stackHasMarker = new Map();
	const markerOnStack = id => {
		let v = stackHasMarker.get(id);
		if (v === undefined) {
			v =
				opts.startMarker.test(frameLabel(nodes.get(id).callFrame)) ||
				(parent.has(id) && markerOnStack(parent.get(id)));
			stackHasMarker.set(id, v);
		}
		return v;
	};

	const { samples, timeDeltas } = profile;
	const n = samples.length;
	// Sample i lasts until sample i+1 arrives, so its self time is timeDeltas[i+1] (the DevTools convention).
	const selfUs = i => (i + 1 < n ? timeDeltas[i + 1] : 0);
	const offsetsUs = new Array(n);
	let t = 0;
	for (let i = 0; i < n; i++) {
		t += timeDeltas[i];
		offsetsUs[i] = t;
	}
	const profileMs = t / 1000;

	let from = 0;
	let to = n;
	let windowRule;
	if (opts.fromMs !== undefined || opts.toMs !== undefined) {
		const fromUs = (opts.fromMs ?? 0) * 1000;
		from = offsetsUs.findIndex(o => o >= fromUs);
		if (from < 0) from = n;
		if (opts.toMs !== undefined) {
			to = offsetsUs.findIndex(o => o > opts.toMs * 1000);
			if (to < 0) to = n;
		}
		windowRule = 'explicit --from-ms/--to-ms';
	} else if (!opts.all) {
		from = samples.findIndex(id => markerOnStack(id));
		if (from < 0) {
			from = 0;
			windowRule = 'start marker not found on any stack (no runtime frame sampled); whole profile used';
		} else {
			windowRule = 'from the first sample with a lib/runtime frame on the stack to the end of the profile';
		}
	} else {
		windowRule = 'whole profile (--all)';
	}

	const self = new Map();
	const inclusive = new Map();
	const inclusivePkg = new Map();
	const inclusiveFile = new Map();
	const detail = new Map();
	const hot = new Map();
	let windowUs = 0;
	for (let i = from; i < to; i++) {
		const id = samples[i];
		const us = selfUs(i);
		windowUs += us;
		const c = classOf(id);
		self.set(c.bucket, (self.get(c.bucket) || 0) + us);
		const dkey = `${c.bucket} ${c.detail}`;
		detail.set(dkey, (detail.get(dkey) || 0) + us);
		const hkey = `${c.bucket} ${frameKey(nodes.get(id).callFrame)}`;
		hot.set(hkey, (hot.get(hkey) || 0) + us);
		for (const b of bucketsOnStack(id)) inclusive.set(b, (inclusive.get(b) || 0) + us);
		const d = detailsOnStack(id);
		for (const p of d.packages) inclusivePkg.set(p, (inclusivePkg.get(p) || 0) + us);
		for (const f of d.files) inclusiveFile.set(f, (inclusiveFile.get(f) || 0) + us);
	}

	const sorted = m => Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
	const split = (m, bucket) =>
		sorted(m)
			.filter(([k]) => k.startsWith(`${bucket} `))
			.map(([k, v]) => [k.slice(bucket.length + 1), v]);

	return {
		file,
		profileMs,
		samples: n,
		window: {
			rule: windowRule,
			firstSample: from,
			lastSample: to - 1,
			startMs: from < n ? offsetsUs[from] / 1000 : profileMs,
			ms: windowUs / 1000
		},
		buckets: sorted(self).map(([bucket, us]) => ({
			bucket,
			selfMs: us / 1000,
			inclusiveMs: (inclusive.get(bucket) || 0) / 1000
		})),
		inclusive: {
			packages: sorted(inclusivePkg)
				.slice(0, opts.top * 4)
				.map(([k, v]) => ({ package: k, ms: v / 1000 })),
			consumerFiles: sorted(inclusiveFile)
				.slice(0, opts.top * 4)
				.map(([k, v]) => ({ file: k, ms: v / 1000 }))
		},
		details: {
			tsflow: split(detail, 'tsflow').map(([k, v]) => ({ where: k, ms: v / 1000 })),
			otherDependencies: split(detail, 'other dependencies').map(([k, v]) => ({ package: k, ms: v / 1000 })),
			consumer: split(detail, 'consumer').map(([k, v]) => ({ file: k, ms: v / 1000 }))
		},
		hot: {
			all: sorted(hot)
				.slice(0, opts.top * 4)
				.map(([k, v]) => ({ bucket: k.split(' ')[0], frame: k.split(' ')[1], ms: v / 1000 })),
			tsflow: split(hot, 'tsflow')
				.slice(0, opts.top * 4)
				.map(([k, v]) => ({ frame: k, ms: v / 1000 })),
			consumer: split(hot, 'consumer')
				.slice(0, opts.top * 4)
				.map(([k, v]) => ({ frame: k, ms: v / 1000 }))
		}
	};
}

function fmtMs(ms) {
	return ms >= 100 ? ms.toFixed(0) : ms.toFixed(1);
}

function table(rows, header, rightAlign) {
	const all = [header, ...rows];
	const widths = header.map((_, i) => Math.max(...all.map(r => String(r[i]).length)));
	const line = r =>
		r.map((c, i) => (rightAlign[i] ? String(c).padStart(widths[i]) : String(c).padEnd(widths[i]))).join('  ');
	return [line(header), widths.map(w => '-'.repeat(w)).join('  '), ...rows.map(line)];
}

function print(result, opts) {
	const out = [];
	const w = result.window;
	const pct = ms => `${((ms / w.ms) * 100).toFixed(1)}%`;
	out.push('');
	out.push(`${path.basename(result.file)}: ${fmtMs(result.profileMs)} ms profiled, ${result.samples} samples`);
	out.push(`window: ${w.rule}`);
	out.push(
		`        samples ${w.firstSample}..${w.lastSample}, starting ${fmtMs(w.startMs)} ms in, ${fmtMs(w.ms)} ms attributed`
	);
	out.push('');
	out.push('Self time by layer (inclusive = time with that layer anywhere on the stack)');
	out.push(
		...table(
			result.buckets.map(b => [b.bucket, fmtMs(b.selfMs), pct(b.selfMs), fmtMs(b.inclusiveMs), pct(b.inclusiveMs)]),
			['layer', 'self ms', 'self %', 'incl ms', 'incl %'],
			[false, true, true, true, true]
		)
	);
	const sub = (title, rows, header) => {
		if (rows.length === 0) return;
		out.push('');
		out.push(title);
		out.push(...table(rows, header, [false, true, true]));
	};
	sub(
		'tsflow self time by lib/ directory',
		result.details.tsflow.map(d => [d.where, fmtMs(d.ms), pct(d.ms)]),
		['where', 'ms', '%']
	);
	sub(
		`other dependencies, top ${opts.top} packages by self time`,
		result.details.otherDependencies.slice(0, opts.top).map(d => [d.package, fmtMs(d.ms), pct(d.ms)]),
		['package', 'ms', '%']
	);
	sub(
		`consumer files, top ${opts.top} by self time`,
		result.details.consumer.slice(0, opts.top).map(d => [d.file, fmtMs(d.ms), pct(d.ms)]),
		['file', 'ms', '%']
	);
	sub(
		`inclusive time by package, top ${opts.top} (time with that package anywhere on the stack; overlapping)`,
		result.inclusive.packages.slice(0, opts.top).map(d => [d.package, fmtMs(d.ms), pct(d.ms)]),
		['package', 'ms', '%']
	);
	sub(
		`inclusive time by consumer file, top ${opts.top} (which step and fixture files the run spends its time under)`,
		result.inclusive.consumerFiles.slice(0, opts.top).map(d => [d.file, fmtMs(d.ms), pct(d.ms)]),
		['file', 'ms', '%']
	);
	sub(
		`tsflow hot functions, top ${opts.top} by self time`,
		result.hot.tsflow.slice(0, opts.top).map(h => [h.frame, fmtMs(h.ms), pct(h.ms)]),
		['function  file:line', 'ms', '%']
	);
	sub(
		`all hot functions, top ${opts.top} by self time`,
		result.hot.all.slice(0, opts.top).map(h => [`[${h.bucket}] ${h.frame}`, fmtMs(h.ms), pct(h.ms)]),
		['function  file:line', 'ms', '%']
	);
	out.push('');
	process.stdout.write(out.join('\n') + '\n');
}

function main() {
	let opts;
	try {
		opts = parseArgs(process.argv.slice(2));
	} catch (err) {
		process.stderr.write(
			`${err.message}\n\nUsage: node attribute-cpuprofile.js [--all] [--start-marker=fn] [--from-ms=n] [--to-ms=n] [--top=n] [--json] <file.cpuprofile>...\n`
		);
		process.exit(2);
	}
	const results = opts.files.map(f => analyse(f, opts));
	if (opts.json) {
		process.stdout.write(JSON.stringify(results, null, 2) + '\n');
		return;
	}
	for (const r of results) print(r, opts);
}

main();
