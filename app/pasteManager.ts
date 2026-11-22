import type { AppState, Emitter } from './state';

function getString(item: DataTransferItem): Promise<string> {
  return new Promise(resolve => {
    item.getAsString(resolve);
  });
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'text/plain': 'txt'
};

function defaultName(blob: Blob, index: number): string {
  const ext = EXTENSIONS[blob.type] || 'bin';
  return `pasted-${index + 1}.${ext}`;
}

export default function pasteManager(state: AppState, emitter: Emitter): void {
  window.addEventListener('paste', async event => {
    if (state.route !== '/' || state.uploading) return;
    const target = event.target as HTMLInputElement | null;
    if (target && ['password', 'text', 'email'].includes(target.type)) return;
    if (!event.clipboardData) return;

    const items = Array.from(event.clipboardData.items);
    const transferFiles = items.filter(item => item.kind === 'file');
    const strings = items.filter(item => item.kind === 'string');
    if (transferFiles.length) {
      const promises = transferFiles.map(async (f, i) => {
        const blob = f.getAsFile();
        if (!blob) {
          return null;
        }
        // A pasted screenshot has no accompanying name string, and a copied
        // file already carries its own name.
        const name = strings[i]
          ? await getString(strings[i])
          : blob.name || defaultName(blob, i);
        return new File([blob], name || defaultName(blob, i), {
          type: blob.type
        });
      });
      const files = (await Promise.all(promises)).filter((f): f is File => !!f);
      if (files.length) {
        emitter.emit('addFiles', { files });
      }
    } else if (strings.length) {
      const s = await getString(strings[0]);
      const file = new File([s], 'pasted.txt', { type: 'text/plain' });
      emitter.emit('addFiles', { files: [file] });
    }
  });
}
