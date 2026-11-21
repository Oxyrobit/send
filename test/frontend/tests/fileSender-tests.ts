import assert from 'assert';
import FileSender from '../../../app/fileSender';
import Archive from '../../../app/archive';

// FileSender uses a File in real life but a Blob works for testing
const blob = new File(['hello world!'], 'text.txt', { type: 'text/plain' });
const archive = new Archive([blob]);

describe('FileSender', function () {
  describe('upload', function () {
    it('returns an OwnedFile on success', async function () {
      const fs = new FileSender();
      const file = await fs.upload(archive);
      assert.ok(file.id);
      assert.equal(file.name, archive.name);
    });
  });
});
