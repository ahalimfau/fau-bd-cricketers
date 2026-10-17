// "Share to WhatsApp": turns a section of the page into a PNG and opens the
// phone's share sheet (or downloads the picture where sharing files isn't
// supported). html-to-image is loaded only when someone taps Share.

export async function shareNode(node: HTMLElement | null, fileName: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (!node) throw new Error('Nothing to share.');
  const { toBlob } = await import('html-to-image');
  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: false,
    // Leave out anything marked as not for the picture (e.g. the share button itself).
    filter: (el) => !(el instanceof HTMLElement && el.dataset.noshare === 'true'),
  });
  if (!blob) throw new Error("Couldn't make the picture.");
  const file = new File([blob], `${fileName}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
