import assert from 'assert';
import { scriptJson } from '../../server/initScript';

describe('initScript', function () {
  describe('scriptJson', function () {
    it('cannot close the script element', function () {
      const json = scriptJson({ notice: '</script><script>alert(1)</script>' });
      assert.ok(!json.includes('</script>'));
      assert.deepEqual(JSON.parse(json), {
        notice: '</script><script>alert(1)</script>'
      });
    });

    it('escapes line separators', function () {
      const json = scriptJson('a\u2028b\u2029c');
      assert.ok(!/[\u2028\u2029]/.test(json));
      assert.equal(JSON.parse(json), 'a\u2028b\u2029c');
    });

    it('encodes undefined as null', function () {
      assert.equal(scriptJson(undefined), 'null');
    });
  });
});
