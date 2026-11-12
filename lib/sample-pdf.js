function pageContent(number) {
  const label = number === 1 ? 'First sample page' : 'Second sample page';
  return [
    '0.90 0.94 0.98 rg 0 535 612 257 re f',
    '0.18 0.31 0.48 rg',
    'BT /F1 17 Tf 48 720 Td (MIRAE NOW - PDF SAMPLE) Tj ET',
    'BT /F1 34 Tf 48 650 Td (Sample notice) Tj ET',
    `BT /F1 22 Tf 48 600 Td (${label}) Tj ET`,
    '0.95 0.97 0.99 rg 48 245 516 240 re f',
    '0.27 0.40 0.56 rg',
    'BT /F1 18 Tf 74 420 Td (This document contains no student information.) Tj ET',
    'BT /F1 18 Tf 74 380 Td (It is only used to test reading PDF pages.) Tj ET',
    `BT /F1 14 Tf 48 72 Td (Page ${number} of 2) Tj ET`,
  ].join('\n') + '\n';
}

function stream(content) {
  return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`;
}

export function makeSamplePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    stream(pageContent(1)),
    stream(pageContent(2)),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}
