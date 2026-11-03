export type AttachmentNotePart = {
  noteIndex: number;
  start: number;
  end: number;
  isLastPart: boolean;
};

export type AttachmentPair = [AttachmentNotePart | null, AttachmentNotePart | null];

type MeasuredNote = { baseHeight: number; itemHeights: number[] };

export function paginateAttachmentNotes(notes: MeasuredNote[], pageHeight: number): AttachmentPair[][] {
  const pages: AttachmentPair[][] = [];
  let page: AttachmentPair[] = [];
  let usedHeight = 0;

  function nextPage() {
    if (page.length) pages.push(page);
    page = [];
    usedHeight = 0;
  }

  for (let index = 0; index < notes.length; index += 2) {
    const pair = notes.slice(index, index + 2);
    const fullHeight = Math.max(...pair.map(note => note.baseHeight + note.itemHeights.reduce((a, b) => a + b, 0)));
    if (page.length && usedHeight + fullHeight > pageHeight) nextPage();

    const starts = [0, 0];
    const finished = [false, pair.length < 2];
    while (!finished.every(Boolean)) {
      let pairHeight = 0;
      const parts = pair.map((note, side): AttachmentNotePart | null => {
        if (finished[side]) return null;
        const start = starts[side];
        let end = start;
        let height = note.baseHeight;
        while (end < note.itemHeights.length && height + note.itemHeights[end] <= pageHeight - usedHeight) {
          height += note.itemHeights[end++];
        }
        if (height > pageHeight - usedHeight || (end === start && end < note.itemHeights.length)) {
          throw new Error("รายการสินค้ายาวเกินพื้นที่หนึ่งหน้า กรุณาตรวจสอบชื่อสินค้า");
        }
        pairHeight = Math.max(pairHeight, height);
        starts[side] = end;
        finished[side] = end === note.itemHeights.length;
        return { noteIndex: index + side, start, end, isLastPart: finished[side] };
      });
      page.push([parts[0], parts[1] ?? null]);
      usedHeight += pairHeight;
      if (!finished.every(Boolean)) nextPage();
    }
  }
  nextPage();
  return pages;
}
