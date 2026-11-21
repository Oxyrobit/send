import type { AppState, Emitter } from './state';

export default function dragManager(state: AppState, emitter: Emitter): void {
  emitter.on('DOMContentLoaded', () => {
    document.body.addEventListener('dragover', event => {
      if (state.route === '/') {
        event.preventDefault();
      }
    });
    document.body.addEventListener('drop', event => {
      if (
        state.route === '/' &&
        !state.uploading &&
        event.dataTransfer &&
        event.dataTransfer.files
      ) {
        event.preventDefault();
        emitter.emit('addFiles', {
          files: Array.from(event.dataTransfer.files)
        });
      }
    });
  });
}
