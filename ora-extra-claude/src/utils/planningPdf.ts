import { loadChunk } from './planning';

/**
 * Gera o PDF A3 ou A4 (paisagem; mesma proporção, então o layout só é reduzido) direto no navegador, sem janela de impressão.
 * Cada página da folha (.he-page, 1587x1123 px = A3) é "fotografada" em alta resolução e vira uma página do PDF.
 */
export async function exportPlanningPdf(root: HTMLElement, filename: string, format: 'a3' | 'a4' = 'a3') {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([loadChunk(() => import('html2canvas-pro')), loadChunk(() => import('jspdf'))]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format, compress: true });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.he-page'));
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale: 2.2, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: 1587 });
    if (i > 0) pdf.addPage(format, 'landscape');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PW, PH, undefined, 'FAST');
  }
  pdf.save(filename);
}
