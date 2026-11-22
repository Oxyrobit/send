import choo from 'choo';
import download from './ui/download';
import body from './ui/body';
import home from './ui/home';
import unsupported from './ui/unsupported';
import error from './ui/error';
import blank from './ui/blank';
import notFound from './ui/notFound';
import type { AppState, Emit, View } from './state';

type ChooHandler = Parameters<choo['route']>[1];

function route(app: choo, path: string, view: View): void {
  app.route(path, view as unknown as ChooHandler);
}

export default function routes(app: choo = new choo({ hash: true })): choo {
  route(app, '/', body(home));
  route(app, '/download/:id', body(download));
  route(app, '/download/:id/:key', body(download));
  route(app, '/unsupported/:reason', body(unsupported));
  route(app, '/error', body(error));
  route(app, '/blank', body(blank));
  route(app, '/oauth', function (state: AppState, emit: Emit) {
    emit('authenticate', state.query.code, state.query.state);
  });
  route(app, '/login', function (state: AppState, emit: Emit) {
    emit('replaceState', '/');
    setTimeout(() => emit('render'));
  });
  route(app, '*', body(notFound));
  return app;
}
