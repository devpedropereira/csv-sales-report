const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importCsv, filterOrders, summarize, parseMoney, parseDate } = require('./metrics.js');

const sample = fs.readFileSync(path.join(__dirname, 'exemplo-pedidos.csv'), 'utf8');
const imported = importCsv(sample);
assert.equal(imported.errors.length, 0);
assert.equal(imported.orders.length, 12);
const summary = summarize(imported.orders);
assert.equal(summary.cents, 1190000);
assert.equal(summary.count, 12);
assert.equal(summary.ticketCents, 1190000 / 12);
assert.deepEqual(summary.series.map(m => [m.month, m.cents, m.count]), [
  ['2026-01', 200000, 2], ['2026-02', 250000, 3],
  ['2026-03', 340000, 3], ['2026-04', 400000, 4]
]);
assert.ok(Math.abs(summary.evolution - (60000 / 340000 * 100)) < 1e-9);
const filtered = summarize(filterOrders(imported.orders, { start: '2026-02-01', end: '2026-03-31', client: 'Loja Aurora' }));
assert.equal(filtered.count, 4);
assert.equal(filtered.cents, 400000);
assert.equal(filtered.ticketCents, 100000);
assert.equal(summarize([]).evolution, null);
assert.equal(summarize([{ id: 'x', date: '2026-01-01', cents: 0 }, { id: 'y', date: '2026-02-01', cents: 100 }]).evolution, null);
assert.equal(parseMoney('R$ 1.234,56'), 123456);
assert.equal(parseMoney('1234.56'), 123456);
assert.equal(parseMoney('-1,00'), null);
assert.equal(parseDate('31/02/2026'), null);
const bad = importCsv('pedido_id;data;valor\nA;01/01/2026;10,00\nA;02/01/2026;20,00\nB;31/02/2026;5,00\nC;03/01/2026;-1,00');
assert.equal(bad.orders.length, 1);
assert.equal(bad.errors.length, 3);
assert.throws(() => importCsv('pedido_id,data\nA,2026-01-01'), /valor/);
assert.throws(() => importCsv('pedido_id,data,valor\n"A,2026-01-01,10'), /Aspas/);
console.log('OK: importação, validação, filtros, totais, ticket e evolução mensal.');
