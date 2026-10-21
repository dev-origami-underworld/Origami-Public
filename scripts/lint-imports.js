#!/usr/bin/env node
/**
 * G-MODULE — Detect import cycles in js/v8/.
 *
 * Walks js/v8/, parses ES module import statements, builds a directed graph,
 * runs DFS to find cycles. Exits 1 on cycle.
 *
 * Until T0.1 extracts modules, js/v8/ is mostly empty — this script
 * trivially passes. That's intentional; the gate exists from day one.
 */

const fs = require('fs');
const path = require('path');

const V8_ROOT = path.resolve(__dirname, '..', 'js', 'v8');

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) walk(p, out);
        else if (name.endsWith('.js')) out.push(p);
    }
    return out;
}

function parseImports(filePath) {
    const src = fs.readFileSync(filePath, 'utf8');
    const out = [];
    // ES module imports — handles `import x from './y.js'`, `import { x } from './y.js'`,
    // and side-effect `import './y.js'`. Skips bare specifiers (node_modules-style).
    const rx = /import\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = rx.exec(src)) !== null) {
        const spec = m[1];
        if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
            const resolved = path.resolve(path.dirname(filePath), spec);
            // try as-is, then with .js
            const candidates = [resolved, resolved + '.js'];
            const hit = candidates.find(c => fs.existsSync(c));
            if (hit) out.push(hit);
        }
    }
    return out;
}

function findCycle(graph) {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    for (const n of graph.keys()) color.set(n, WHITE);

    function dfs(u) {
        color.set(u, GRAY);
        for (const v of graph.get(u) || []) {
            if (color.get(v) === GRAY) {
                // reconstruct
                const cycle = [v];
                let cur = u;
                while (cur !== v && cur !== undefined) {
                    cycle.push(cur);
                    cur = parent.get(cur);
                }
                cycle.push(v);
                return cycle.reverse();
            }
            if (color.get(v) === WHITE) {
                parent.set(v, u);
                const c = dfs(v);
                if (c) return c;
            }
        }
        color.set(u, BLACK);
        return null;
    }

    for (const n of graph.keys()) {
        if (color.get(n) === WHITE) {
            const c = dfs(n);
            if (c) return c;
        }
    }
    return null;
}

const files = walk(V8_ROOT);
const graph = new Map();
for (const f of files) graph.set(f, parseImports(f));

if (files.length === 0) {
    console.log('[lint:imports] OK — no v8 modules yet (extraction in T0.1)');
    process.exit(0);
}

const cycle = findCycle(graph);
if (cycle) {
    console.error('[lint:imports] FAIL — import cycle detected:');
    for (const n of cycle) console.error('  → ' + path.relative(process.cwd(), n));
    process.exit(1);
}

console.log(`[lint:imports] OK — ${files.length} module(s) scanned, no cycles`);
process.exit(0);
