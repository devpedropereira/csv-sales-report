(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Relatorios = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUIRED = ['pedido_id', 'data', 'valor'];
  const OPTIONAL = ['cliente'];

  function parseCsv(text) {
    const input = String(text).replace(/^\uFEFF/, '');
    const firstLine = input.split(/\r?\n/, 1)[0];
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '"') {
        if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted) {
          if (i + 1 < input.length && ![delimiter, '\r', '\n'].includes(input[i + 1])) throw new Error('Texto após aspas fechadas no CSV.');
          quoted = false;
        }
        else if (cell === '') quoted = true;
        else throw new Error('Aspas em posição inválida no CSV.');
      } else if (ch === delimiter && !quoted) {
        row.push(cell); cell = '';
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        row.push(cell);
        if (row.some(value => value.trim() !== '')) rows.push(row);
        row = []; cell = '';
      } else cell += ch;
    }
    if (quoted) throw new Error('Aspas não fechadas no CSV.');
    row.push(cell);
    if (row.some(value => value.trim() !== '')) rows.push(row);
    return rows;
  }

  function parseDate(value) {
    const raw = String(value).trim();
    let year, month, day;
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) [, year, month, day] = match;
    else {
      match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
      if (!match) return null;
      [, day, month, year] = match;
    }
    const date = new Date(Date.UTC(+year, +month - 1, +day));
    if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day) return null;
    return `${year}-${month}-${day}`;
  }

  function parseMoney(value) {
    let raw = String(value).trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
    if (!raw || raw.startsWith('-')) return null;
    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (/^\d+,\d{1,2}$/.test(raw)) raw = raw.replace(',', '.');
    else if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    const amount = Number(raw);
    return Number.isSafeInteger(Math.round(amount * 100)) ? Math.round(amount * 100) : null;
  }

  function importCsv(text) {
    const table = parseCsv(text);
    if (!table.length) throw new Error('O CSV está vazio.');
    const header = table[0].map(cell => cell.trim().toLowerCase());
    const missing = REQUIRED.filter(name => !header.includes(name));
    if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
    if (new Set(header).size !== header.length) throw new Error('O cabeçalho contém colunas repetidas.');
    const orders = [], errors = [], ids = new Set();
    table.slice(1).forEach((cells, index) => {
      const line = index + 2;
      if (cells.length !== header.length) { errors.push(`Linha ${line}: número de colunas incorreto.`); return; }
      const value = Object.fromEntries(header.map((name, i) => [name, cells[i].trim()]));
      const id = value.pedido_id;
      const date = parseDate(value.data);
      const cents = parseMoney(value.valor);
      if (!id) errors.push(`Linha ${line}: pedido_id vazio.`);
      else if (ids.has(id)) errors.push(`Linha ${line}: pedido_id duplicado (${id}).`);
      else if (!date) errors.push(`Linha ${line}: data inválida.`);
      else if (cents === null) errors.push(`Linha ${line}: valor inválido; use um valor não negativo com até 2 casas decimais.`);
      else {
        ids.add(id);
        orders.push({ id, date, cents, cliente: value.cliente || '' });
      }
    });
    return { orders, errors, rows: table.length - 1, hasClient: header.includes(OPTIONAL[0]) };
  }

  function filterOrders(orders, filters) {
    return orders.filter(order => (!filters.start || order.date >= filters.start) &&
      (!filters.end || order.date <= filters.end) &&
      (!filters.client || order.cliente === filters.client));
  }

  function summarize(orders) {
    const months = new Map();
    let cents = 0;
    for (const order of orders) {
      cents += order.cents;
      const key = order.date.slice(0, 7);
      const month = months.get(key) || { month: key, cents: 0, count: 0 };
      month.cents += order.cents;
      month.count++;
      months.set(key, month);
    }
    const series = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    const last = series.at(-1), previous = series.at(-2);
    const evolution = last && previous && previous.cents !== 0
      ? (last.cents - previous.cents) / previous.cents * 100 : null;
    return { cents, count: orders.length, ticketCents: orders.length ? cents / orders.length : 0,
      series, evolution, lastMonth: last?.month || null, previousMonth: previous?.month || null };
  }

  return { parseCsv, parseDate, parseMoney, importCsv, filterOrders, summarize };
});
