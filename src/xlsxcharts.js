// Native (editable) Excel charts. ExcelJS cannot write charts, so the chart parts are written here as OOXML (the same
// structure Excel itself produces) and injected into the finished .xlsx with JSZip.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rgb = (c) => String(c).replace('#', '').slice(0, 6).toUpperCase();
const NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const fillXml = (c, alpha) => `<a:solidFill><a:srgbClr val="${rgb(c)}">${alpha ? `<a:alpha val="${alpha}"/>` : ''}</a:srgbClr></a:solidFill>`;
const txPr = (color, size) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr${size ? ` sz="${size}"` : ''} baseline="0">${fillXml(color)}</a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>`;
const colName = (n) => { let s = ''; for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// spec: { type: 'doughnut' | 'bar' | 'column' | 'area', title, sheet, catCol, valCol, firstRow, cats[], vals[], seriesName, colors?[], T }
export function chartXml(spec) {
  const { type, title, sheet, catCol, valCol, firstRow, cats, vals, seriesName, colors = [], T } = spec;
  const last = firstRow + cats.length - 1, q = `'${sheet.replace(/'/g, "''")}'`;
  const cat = `<c:cat><c:strRef><c:f>${q}!$${colName(catCol)}$${firstRow}:$${colName(catCol)}$${last}</c:f><c:strCache><c:ptCount val="${cats.length}"/>${cats.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${q}!$${colName(valCol)}$${firstRow}:$${colName(valCol)}$${last}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`;
  const lbl = (extra) => `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(T.ink, 1000)}${extra}<c:showLegendKey val="0"/><c:showVal val="${type === 'doughnut' ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${type === 'doughnut' ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const serName = `<c:tx><c:v>${esc(seriesName)}</c:v></c:tx>`;
  const axisTx = txPr(T.muted, 900);
  const lineSp = `<c:spPr><a:ln w="6350">${fillXml(T.line)}</a:ln></c:spPr>`;
  const grid = `<c:majorGridlines><c:spPr><a:ln w="6350">${fillXml(T.line)}</a:ln></c:spPr></c:majorGridlines>`;
  let body, axes = '';
  if (type === 'doughnut') {
    const pts = cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:spPr>${fillXml(colors[i % colors.length] ?? T.v)}<a:ln w="19050">${fillXml(T.card)}</a:ln></c:spPr></c:dPt>`).join('');
    body = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${serName}${pts}${lbl('')}${cat}${val}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`;
  } else {
    const horizontal = type === 'bar';
    const spPr = type === 'area' ? `<c:spPr>${fillXml(T.v, 55000)}<a:ln w="28575">${fillXml(T.v2)}</a:ln></c:spPr>` : `<c:spPr>${fillXml(T.v)}</c:spPr>`;
    const ser = `<c:ser><c:idx val="0"/><c:order val="0"/>${serName}${spPr}${type === 'area' ? '' : '<c:invertIfNegative val="0"/>'}${type === 'area' ? '' : lbl('')}${cat}${val}</c:ser>`;
    body = type === 'area'
      ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:axId val="50010001"/><c:axId val="50010002"/></c:areaChart>`
      : `<c:barChart><c:barDir val="${horizontal ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="60"/><c:axId val="50010001"/><c:axId val="50010002"/></c:barChart>`;
    axes = `<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${lineSp}${axisTx}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
      + `<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 't' : 'l'}"/>${grid}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${axisTx}<c:crossAx val="50010001"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="${type === 'area' ? 'midCat' : 'between'}"/></c:valAx>`;
  }
  const legend = type === 'doughnut' ? `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${txPr(T.ink, 1000)}</c:legend>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace ${NS}><c:roundedCorners val="0"/><c:chart>`
    + `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1" baseline="0">${fillXml(T.ink)}</a:defRPr></a:pPr><a:r><a:rPr lang="pt-BR" sz="1400" b="1" baseline="0">${fillXml(T.ink)}</a:rPr><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    + `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${body}${axes}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
    + `<c:spPr>${fillXml(T.card)}<a:ln w="9525">${fillXml(T.line)}</a:ln></c:spPr>${txPr(T.ink)}`
    + `<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
}

const anchorXml = (id, rid, from, to) => `<xdr:twoCellAnchor><xdr:from><xdr:col>${from.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${from.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${to.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${to.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
  + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="Gráfico ${id - 99}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;

// zip: the xlsx written by ExcelJS; charts: [{ sheetIndex (1-based, in workbook order), spec, from: {col,row}, to: {col,row} }]
// Every chart sheet must already own a drawing part (ExcelJS makes one when the sheet holds an image).
export async function injectCharts(JSZip, bytes, charts) {
  const zip = await JSZip.loadAsync(bytes);
  let ct = await zip.file('[Content_Types].xml').async('string');
  let n = 0;
  for (const ch of charts) {
    const relsPath = `xl/worksheets/_rels/sheet${ch.sheetIndex}.xml.rels`, relsFile = zip.file(relsPath);
    if (!relsFile) throw new Error(`a aba ${ch.sheetIndex} não tem desenho`);
    const target = (await relsFile.async('string')).match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/)?.[1];
    if (!target) throw new Error(`a aba ${ch.sheetIndex} não tem desenho`);
    n++;
    zip.file(`xl/charts/chart${n}.xml`, chartXml(ch.spec));
    ct = ct.replace('</Types>', `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
    const dRels = `xl/drawings/_rels/${target}.rels`;
    let rels = await zip.file(dRels).async('string');
    rels = rels.replace('</Relationships>', `<Relationship Id="rIdChart${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`);
    zip.file(dRels, rels);
    let d = await zip.file(`xl/drawings/${target}`).async('string');
    // drop the 1-pixel placeholder picture that only exists so ExcelJS creates the drawing part
    d = d.replace(/<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g, (m) => (m.includes('<xdr:pic>') ? '' : m));
    d = d.replace('</xdr:wsDr>', `${anchorXml(99 + n, `rIdChart${n}`, ch.from, ch.to)}</xdr:wsDr>`);
    zip.file(`xl/drawings/${target}`, d);
  }
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
