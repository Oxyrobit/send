import html from 'choo/html';
import type { Express } from 'express';
import assets from '../../common/assets';
import initScript from '../../server/initScript';

export default function testRoutes(app: Express): void {
  app.get('/mocha.css', function (req, res) {
    res.sendFile(require.resolve('mocha/mocha.css'));
  });
  app.get('/mocha.js', function (req, res) {
    res.sendFile(require.resolve('mocha/mocha.js'));
  });
  app.get('/test', function (req, res) {
    res.send(
      html`
        <!DOCTYPE html>
        <html>
          <head>
            <link rel="stylesheet" type="text/css" href="/mocha.css" />
            <script src="/mocha.js"></script>
            <script>
              const reporters = Mocha.reporters;
              // HTML for people, JSON (runner.testResults) for the runner
              class Combo extends reporters.HTML {
                constructor(runner, options) {
                  super(runner, options);
                  new reporters.JSON(runner, options);
                }
              }
              mocha.setup({
                ui: 'bdd',
                reporter: Combo,
                timeout: 5000
              });
            </script>
            ${initScript({
              cspNonce: 'test'
            })}
            <script src="${assets.get('tests.js')}"></script>
          </head>
          <body>
            <div id="mocha"></div>
            <script>
              window.runner = mocha.run();
            </script>
          </body>
        </html>
      `.toString()
    );
  });
}
