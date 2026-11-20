(() => {
  'use strict';
  const api = window.Relatorios;
  const example = `pedido_id,data,valor,cliente
P001,2026-01-05,"1.250,00",Loja Aurora
P002,2026-01-18,"750,00",Café Norte
P003,2026-02-03,"900,00",Loja Aurora
P004,2026-02-14,"1.100,00",Café Norte
P005,2026-02-27,"500,00",Loja Aurora
P006,2026-03-04,"1.400,00",Loja Aurora
P007,2026-03-11,"800,00",Café Norte
P008,2026-03-23,"1.200,00",Loja Aurora
P009,2026-04-02,"600,00",Café Norte
P010,2026-04-09,"1.500,00",Loja Aurora
P011,2026-04-19,"1.100,00",Café Norte
P012,2026-04-28,"800,00",Loja Aurora`;
  const $ = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  const number = value => new Intl.NumberFormat('pt-BR').format(value);
  const monthLabel = key => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  let source = { orders: [], errors: [], rows: 0, hasClient: false };
  let current = null;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, value) => {
    const node = document.createElementNS(svgNs, tag);
    for (const [name, attribute] of Object.entries(attrs)) node.setAttribute(name, String(attribute));
    if (value !== undefined) node.textContent = value;
    return node;
  };

  function renderChart(series) {
    const chart = $('chart');
    chart.replaceChildren();
    chart.hidden = series.length === 0;
    document.querySelector('.mobile-chart-hint').hidden = series.length === 0;
    $('chart-note').textContent = `${series.length} ${series.length === 1 ? 'mês com pedidos' : 'meses com pedidos'} no recorte`;
    if (!series.length) { chart.setAttribute('aria-label', 'Sem dados para o gráfico'); return; }
    const max = Math.max(...series.map(month => month.cents), 1);
    const plot = { left: 60, right: 612, top: 42, bottom: 212 };
    const graph = svg('svg', { viewBox: '0 0 640 260', role: 'presentation', 'aria-hidden': 'true' });
    for (let step = 0; step <= 3; step++) {
      const y = plot.bottom - step * (plot.bottom - plot.top) / 3;
      graph.append(svg('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, stroke: '#e6edf3', 'stroke-width': 1 }));
      graph.append(svg('text', { x: 50, y: y + 4, 'text-anchor': 'end', fill: '#8293a1', 'font-size': 10 }, `R$ ${new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(max * step / 3 / 100)}`));
    }
    const points = series.map((month, index) => ({
      x: series.length === 1 ? (plot.left + plot.right) / 2 : plot.left + index * (plot.right - plot.left) / (series.length - 1),
      y: plot.bottom - month.cents / max * (plot.bottom - plot.top), month
    }));
    if (points.length > 1) {
      graph.append(svg('path', { d: `M ${points[0].x} ${plot.bottom} L ${points.map(point => `${point.x} ${point.y}`).join(' L ')} L ${points.at(-1).x} ${plot.bottom} Z`, fill: '#ecf4f9' }));
      graph.append(svg('polyline', { points: points.map(point => `${point.x},${point.y}`).join(' '), fill: 'none', stroke: '#2875ad', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
    const labelEvery = Math.max(1, Math.ceil(points.length / 6));
    points.forEach((point, index) => {
      const circle = svg('circle', { cx: point.x, cy: point.y, r: 5, fill: '#fff', stroke: '#2875ad', 'stroke-width': 3 });
      circle.append(svg('title', {}, `${monthLabel(point.month.month)}: ${money(point.month.cents)}`));
      graph.append(circle);
      if (index % labelEvery === 0 || index === points.length - 1) graph.append(svg('text', { x: point.x, y: 244, 'text-anchor': 'middle', fill: '#6c7f90', 'font-size': 10 }, monthLabel(point.month.month)));
      if (points.length <= 6) graph.append(svg('text', { x: point.x, y: Math.max(22, point.y - 14), 'text-anchor': 'middle', fill: '#1f5079', 'font-size': 10, 'font-weight': 700 }, money(point.month.cents)));
    });
    chart.append(graph);
    chart.setAttribute('aria-label', `Faturamento mensal: ${series.map(month => `${monthLabel(month.month)}, ${money(month.cents)}`).join('; ')}`);
  }

  function renderRows(orders) {
    const rows = [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
    $('records-count').textContent = orders.length > 100 ? `100 de ${number(orders.length)} pedidos` : `${number(orders.length)} ${orders.length === 1 ? 'pedido' : 'pedidos'}`;
    $('records-empty').hidden = orders.length !== 0;
    const fragment = document.createDocumentFragment();
    for (const order of rows) {
      const row = document.createElement('tr');
      for (const value of [order.id, new Date(`${order.date}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }), order.cliente || '—', money(order.cents)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      fragment.append(row);
    }
    $('records-body').replaceChildren(fragment);
  }

  function setStatus(message, kind = '') {
    $('import-status').textContent = message;
    $('import-status').className = `status ${kind}`;
  }

  function load(text, name) {
    try {
      const result = api.importCsv(text);
      source = result;
      $('error-list').replaceChildren();
      for (const error of result.errors) {
        const item = document.createElement('li');
        item.textContent = error;
        $('error-list').append(item);
      }
      $('error-details').hidden = result.errors.length === 0;
      const clients = [...new Set(result.orders.map(order => order.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      $('client-filter').replaceChildren(new Option('Todos os clientes', ''), ...clients.map(client => new Option(client, client)));
      $('client-label').hidden = !result.hasClient || clients.length === 0;
      $('start-date').value = '';
      $('end-date').value = '';
      const valid = result.orders.length, rows = result.rows, rejected = result.errors.length;
      setStatus(`${name}: ${number(valid)} ${valid === 1 ? 'pedido válido' : 'pedidos válidos'} em ${number(rows)} ${rows === 1 ? 'linha' : 'linhas'}.${rejected ? ` ${number(rejected)} ${rejected === 1 ? 'linha rejeitada' : 'linhas rejeitadas'}; veja os detalhes.` : ''}`, rejected ? 'warn' : '');
      render();
    } catch (error) {
      setStatus(`${name}: ${error.message} Os dados anteriores permanecem na tela.`, 'fail');
    }
  }

  function render() {
    const start = $('start-date').value, end = $('end-date').value;
    if (start && end && start > end) {
      $('filter-error').textContent = 'A data inicial deve ser anterior ou igual à data final.';
      $('filter-error').hidden = false;
      $('export-button').disabled = true;
      for (const id of ['revenue', 'orders', 'ticket', 'evolution', 'period-months', 'best-month', 'best-revenue']) $(id).textContent = '—';
      $('evolution-note').textContent = 'Corrija o período para ver a evolução';
      $('chart').hidden = true;
      document.querySelector('.mobile-chart-hint').hidden = true;
      $('empty-state').hidden = true;
      $('records-body').replaceChildren();
      $('records-count').textContent = '—';
      $('records-empty').textContent = 'Corrija as datas para ver os pedidos.';
      $('records-empty').hidden = false;
      return;
    }
    $('filter-error').hidden = true;
    const orders = api.filterOrders(source.orders, { start, end, client: $('client-filter').value });
    current = api.summarize(orders);
    $('revenue').textContent = money(current.cents);
    $('orders').textContent = number(current.count);
    $('ticket').textContent = money(current.ticketCents);
    $('evolution').textContent = current.evolution === null ? '—' : `${current.evolution >= 0 ? '+' : ''}${current.evolution.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    $('evolution').dataset.trend = current.evolution === null ? 'neutral' : current.evolution >= 0 ? 'positive' : 'negative';
    $('evolution-note').textContent = current.previousMonth
      ? `${monthLabel(current.previousMonth)} → ${monthLabel(current.lastMonth)}${current.evolution === null ? ' · base zero' : ''}`
      : 'Requer dois meses com pedidos';
    $('empty-state').hidden = current.count !== 0;
    $('records-empty').textContent = 'Nenhum pedido para mostrar.';
    $('export-button').disabled = current.count === 0;
    renderChart(current.series);
    renderRows(orders);
    $('period-months').textContent = number(current.series.length);
    const best = current.series.reduce((winner, month) => !winner || month.cents > winner.cents ? month : winner, null);
    $('best-month').textContent = best ? monthLabel(best.month) : '—';
    $('best-revenue').textContent = best ? money(best.cents) : '—';
  }

  function exportSummary() {
    if (!current || !current.count) return;
    const decimal = cents => (cents / 100).toFixed(2).replace('.', ',');
    const rows = ['tipo;mes;faturamento_brl;pedidos;ticket_medio_brl'];
    current.series.forEach(month => rows.push(`mes;${month.month};${decimal(month.cents)};${month.count};${decimal(month.cents / month.count)}`));
    rows.push(`total;;${decimal(current.cents)};${current.count};${decimal(current.ticketCents)}`);
    const blob = new Blob(['\uFEFF', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'resumo-vendas.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('csv-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try { load(await file.text(), file.name); }
    catch (error) { setStatus(`Falha ao ler arquivo: ${error.message}`, 'fail'); }
    event.target.value = '';
  });
  $('example-button').addEventListener('click', () => load(example, 'Exemplo'));
  $('reset-button').addEventListener('click', () => {
    $('start-date').value = ''; $('end-date').value = ''; $('client-filter').value = ''; render();
  });
  for (const id of ['start-date', 'end-date', 'client-filter']) $(id).addEventListener('change', render);
  $('export-button').addEventListener('click', exportSummary);
  load(example, 'Exemplo');
})();
