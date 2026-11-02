import { fitText, LETTER_SPACING_EM, LINE_HEIGHT, loc, pageSequence, stageColor, type Book, type BookLayout } from '@openbook/shared';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import i18n from '@/i18n';
import { media } from '@/lib/media';

export type Paper = 'a4' | 'letter';

/** Landscape page sizes in CSS px (96 dpi). */
const PAPER: Record<Paper, { css: string; width: number; height: number }> = {
  a4: { css: 'A4 landscape', width: 1123, height: 794 },
  letter: { css: 'letter landscape', width: 1056, height: 816 },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * FR-76 / AC-13: one landscape sheet per reader page, in reader order, keeping stage colour and the
 * stage's minimum text size relative to the sheet height.
 */
export async function buildBookHtml(book: Book, layout: BookLayout, paper: Paper): Promise<string> {
  const { css, width, height } = PAPER[paper];
  const images = new Map<number, string | null>();
  for (const [i, p] of book.pages.entries()) if (p.image?.localPath) images.set(i, await media.dataUrl(p.image.localPath));

  const textBlock = (text: string, w: number) => {
    const fit = fitText(text, w, height, book.stage);
    return `<div class="text" style="width:${w}px;font-size:${fit.fontSize}px;line-height:${fit.fontSize * LINE_HEIGHT}px;color:${stageColor(book.stage)}">${esc(text)}</div>`;
  };
  const img = (i: number, w: number) => {
    const src = images.get(i);
    return src ? `<img src="${src}" style="width:${w}px;height:${height}px" />` : '';
  };

  const sheets = pageSequence(book, layout).map((p) => {
    switch (p.kind) {
      case 'cover':
        return textBlock(loc(book.title), width);
      case 'end':
        return textBlock(i18n.t('reader.theEnd'), width);
      case 'text':
        return textBlock(loc(book.pages[p.pageIndex].text), width);
      case 'picture':
        return img(p.pageIndex, width);
      case 'spread':
        return textBlock(loc(book.pages[p.pageIndex].text), width / 2) + img(p.pageIndex, width / 2);
    }
  });

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(loc(book.title))}</title><style>
@page { size: ${css}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { width: ${width}px; height: ${height}px; display: flex; align-items: center; justify-content: center; overflow: hidden; page-break-after: always; break-after: page; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.text { padding: 0 4%; text-align: center; font-weight: 600; letter-spacing: ${LETTER_SPACING_EM}em; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
img { object-fit: contain; display: block; }
</style></head><body>${sheets.map((s) => `<div class="sheet">${s}</div>`).join('')}</body></html>`;
}

/** Native: the system print sheet (which offers "Save as PDF"). Web: the browser print dialog. */
export async function printBook(book: Book, layout: BookLayout, paper: Paper): Promise<void> {
  const html = await buildBookHtml(book, layout, paper);
  if (Platform.OS !== 'web') {
    await Print.printAsync({ html, orientation: Print.Orientation.landscape });
    return;
  }
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await Promise.all(Array.from(doc.images, (im) => (im.complete ? Promise.resolve() : new Promise((r) => (im.onload = im.onerror = r)))));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
}
