// Text helpers shared by the UI (api/analyze.js carries its own copy: functions cannot import from src).
const NAMED = { ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', acirc: 'â', Acirc: 'Â', ecirc: 'ê', Ecirc: 'Ê', ocirc: 'ô', Ocirc: 'Ô', agrave: 'à', Agrave: 'À', uuml: 'ü', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (t) => t
  .replace(/&(#x?[0-9a-f]+|[a-z]+);?/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : NAMED[e] ?? m))
  .replace(/([çãõáéíóúâêôàÇÃÕÁÉÍÓÚÂÊÔÀ])&(?=[a-zA-Z])/g, '$1'); // "&ccedil&atilde&o" (no semicolons) → "ção"
