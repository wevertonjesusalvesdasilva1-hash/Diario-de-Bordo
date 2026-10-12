/**
 * Gera o PDF A3 (paisagem) direto no navegador, sem janela de impressão.
 * Cada folha (dia) é "fotografada" em alta resolução e fatiada em páginas A3 sem cortar linhas;
 * nas continuações da lista nominal o cabeçalho da tabela é repetido.
 */
const PAGE_W = 1587; // A3 paisagem a 96 dpi
const PAGE_H = 1123;

export async function exportPlanningPdf(root: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const SCALE = 2.2;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const pageHpx = Math.round(PAGE_H * SCALE);
  let first = true;

  const sheets = Array.from(root.querySelectorAll<HTMLElement>('[data-export-sheet]'));
  for (const sheet of sheets) {
    const canvas = await html2canvas(sheet, { scale: SCALE, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: PAGE_W });
    const H = canvas.height;
    const top0 = sheet.getBoundingClientRect().top;
    const rel = (el: Element, edge: 'top' | 'bottom') => Math.round((el.getBoundingClientRect()[edge] - top0) * SCALE);

    // pontos onde é seguro quebrar (fim de linhas e de blocos) + início forçado da lista nominal
    const safe = Array.from(sheet.querySelectorAll('tr, section')).map((el) => rel(el, 'bottom')).filter((y) => y > 0 && y < H).sort((a, b) => a - b);
    const listBox = sheet.querySelector<HTMLElement>('[data-list]');
    const listTop = listBox ? rel(listBox, 'top') : -1;
    const thead = listBox?.querySelector('thead');
    const headTop = thead ? rel(thead, 'top') : 0;
    const headBottom = thead ? rel(thead, 'bottom') : 0;
    const headH = Math.max(0, headBottom - headTop);

    let y = 0;
    while (y < H) {
      const continuation = listTop >= 0 && y > listTop + 5 && headH > 0; // página de continuação da lista
      const room = pageHpx - (continuation ? headH : 0);
      const limit = y + room;
      let end: number;
      if (limit >= H) end = H;
      else {
        end = limit;
        const cut = [...safe].reverse().find((s) => s <= limit && s > y + 80);
        if (cut) end = cut;
        // a lista nominal começa em página nova, se ainda não começou nesta
        if (listTop > y + 40 && listTop <= limit && !(y >= listTop)) end = Math.min(end, listTop);
      }
      const page = document.createElement('canvas');
      page.width = canvas.width;
      page.height = pageHpx;
      const ctx = page.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, page.width, page.height);
      let dy = 0;
      if (continuation) {
        ctx.drawImage(canvas, 0, headTop, canvas.width, headH, 0, 0, canvas.width, headH);
        dy = headH;
      }
      ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, dy, canvas.width, end - y);
      if (!first) pdf.addPage('a3', 'landscape');
      first = false;
      pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PW, PH, undefined, 'FAST');
      y = end;
    }
  }
  pdf.save(filename);
}
