import type Nanobus from 'nanobus';
import type Component from 'choo/component';
import type {
  AuthConfig,
  Defaults,
  Limits,
  Prefs,
  Translate,
  WebUI
} from '../common/types';
import type Archive from './archive';
import type FileReceiver from './fileReceiver';
import type { DownloadFileInfo } from './fileReceiver';
import type FileSender from './fileSender';
import type OwnedFile from './ownedFile';
import type { Storage } from './storage';
import type User from './user';
import type { Capabilities } from './capabilities';

export type Emit = Nanobus['emit'];
export type Emitter = Nanobus;

export type Close = (event?: Event) => void;

/** A modal dialog, rendered by ui/modal */
export interface Dialog {
  (state: AppState, emit: Emit, close: Close): HTMLElement;
  type?: string;
}

/** Things the server renders into the page that the browser does not have */
export interface ServerRenderState {
  ui: {
    colors: { primary: string; accent: string };
    assets: Record<string, string>;
  };
  layout?: (state: AppState, body: HTMLElement) => HTMLElement;
  cspNonce?: string;
  robots?: string;
  title?: string;
  description?: string;
  baseUrl?: string;
  authConfig?: AuthConfig | null;
  prefs?: Prefs;
  downloadMetadata?: { nonce?: string; pwd?: boolean; status?: number };
}

/** The choo application state, shared by the browser and the server render. */
export interface AppState extends Partial<ServerRenderState> {
  // provided by choo
  events: Record<string, string>;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  href: string;
  route: string;
  title: string;
  components: Record<string, Record<string, unknown>>;
  cache<T extends Component>(
    Ctor: new (name: string, state: AppState, emit: Emit) => T,
    id: string
  ): T;

  // ours
  LIMITS: Limits;
  DEFAULTS: Defaults;
  WEB_UI: WebUI;
  PREFS: Prefs;
  locale: string;
  translate: Translate;
  capabilities: Capabilities;
  storage: Storage;
  user: User;
  archive: Archive;
  transfer: FileSender | FileReceiver | null;
  fileInfo: DownloadFileInfo | null;
  modal?: Dialog | null;
  uploading?: boolean;
  settingPassword?: boolean;
  passwordSetError?: unknown;
  sentry: typeof import('@sentry/browser');
}

export type View = (state: AppState, emit: Emit) => HTMLElement | string | void;

export type { OwnedFile };
