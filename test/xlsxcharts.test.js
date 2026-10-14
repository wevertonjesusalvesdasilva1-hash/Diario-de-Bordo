import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { chartXml, injectCharts } from '../src/xlsxcharts.js';

const T = { ink: '#f2f2f7', muted: '#9d9db3', line: 'rgba(255,255,255,.1)', v: '#8b5cf6', v2: '#c4b5fd', card: '#16161f' };

test('gráfico nativo: referências da planilha, valores em cache e texto escapado', () => {
  const x = chartXml({ type: 'doughnut', title: 'Parado & motivo <teste>', sheet: "Por 'motivo'", catCol: 1, valCol: 2, firstRow: 2, cats: ['A&B', 'C'], vals: [10, 5], seriesName: 'min', colors: ['#ff0000', '#00ff00'], T });
  assert.match(x, /<c:doughnutChart>/);
  assert.match(x, /'Por ''motivo'''!\$A\$2:\$A\$3/); assert.match(x, /'Por ''motivo'''!\$B\$2:\$B\$3/);
  assert.match(x, /A&amp;B/); assert.match(x, /Parado &amp; motivo &lt;teste&gt;/);
  assert.match(x, /<c:v>10<\/c:v>/); assert.match(x, /FF0000/);
  for (const type of ['bar', 'column', 'area']) assert.match(chartXml({ type, title: 't', sheet: 'S', catCol: 1, valCol: 2, firstRow: 2, cats: ['a'], vals: [1], seriesName: 's', T }), /<c:valAx>/);
  assert.match(chartXml({ type: 'bar', title: 't', sheet: 'S', catCol: 1, valCol: 2, firstRow: 2, cats: ['a'], vals: [1], seriesName: 's', T }), /<c:barDir val="bar"\/>/);
});

test('injeta o gráfico no xlsx: arquivo do gráfico, ligação, tipo de conteúdo e fim da imagem de apoio', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="x"></Types>');
  zip.file('xl/worksheets/_rels/sheet3.xml.rels', '<Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing2.xml"/></Relationships>');
  zip.file('xl/drawings/_rels/drawing2.xml.rels', '<Relationships><Relationship Id="rId1" Type="image" Target="../media/image9.png"/></Relationships>');
  zip.file('xl/drawings/drawing2.xml', '<xdr:wsDr xmlns:xdr="u"><xdr:oneCellAnchor><xdr:pic>pixel</xdr:pic></xdr:oneCellAnchor></xdr:wsDr>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const out = await JSZip.loadAsync(await injectCharts(JSZip, bytes, [{ sheetIndex: 3, from: { col: 4, row: 1 }, to: { col: 14, row: 22 },
    spec: { type: 'column', title: 'T', sheet: 'Por turno', catCol: 1, valCol: 2, firstRow: 2, cats: ['Turno 1'], vals: [60], seriesName: 's', T } }]));
  assert.ok(out.file('xl/charts/chart1.xml'));
  assert.match(await out.file('[Content_Types].xml').async('string'), /\/xl\/charts\/chart1\.xml/);
  assert.match(await out.file('xl/drawings/_rels/drawing2.xml.rels').async('string'), /rIdChart1.*charts\/chart1\.xml/);
  const d = await out.file('xl/drawings/drawing2.xml').async('string');
  assert.ok(!d.includes('<xdr:pic>') && d.includes('r:id="rIdChart1"') && d.includes('<xdr:col>4</xdr:col>'));
  await assert.rejects(injectCharts(JSZip, bytes, [{ sheetIndex: 9, from: { col: 0, row: 0 }, to: { col: 1, row: 1 }, spec: {} }]), /não tem desenho/);
});
