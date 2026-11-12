import { getDocument, GlobalWorkerOptions } from '/vendor/pdf.mjs';

GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';

const container = document.querySelector('#pdf-pages');
const status = document.querySelector('#pdf-status');

try {
  const pdf = await getDocument({ url: container.dataset.pdfUrl }).promise;
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const natural = page.getViewport({ scale: 1 });
    const width = container.clientWidth;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width / natural.width) * pixelRatio });
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.setAttribute('aria-label', `PDF ${number}페이지`);
    container.append(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }
  status.textContent = `${pdf.numPages}페이지를 불러왔습니다. 아래로 스크롤해 읽으세요.`;
} catch {
  status.textContent = 'PDF를 표시할 수 없습니다. 링크를 다시 확인해 주세요.';
}
