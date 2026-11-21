import assets from '../common/assets';
import { getFileList, setFileList } from './api';
import { encryptStream, decryptStream } from './ece';
import { arrayToB64, b64ToArray, streamToArrayBuffer } from './utils';
import { blobStream } from './streams';
import { getFileListKey, prepareScopedBundleKey, preparePkce } from './fxa';
import type { Storage, MergeResult } from './storage';
import type { OwnedFileData } from './ownedFile';
import type { AuthConfig, Limits } from '../common/types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const anonId = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));

async function hashId(id: string): Promise<string> {
  const d = new Date();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const encoded = textEncoder.encode(`${id}:${year}:${month}`);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return arrayToB64(new Uint8Array(hash.slice(16)));
}

export interface UserInfo {
  uid?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  avatarDefault?: boolean;
  access_token?: string;
  refresh_token?: string;
  fileListKey?: string;
  [key: string]: unknown;
}

export interface Utms {
  campaign?: string;
  content?: string;
  medium?: string;
  source?: string;
  term?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  keys_jwe: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default class User {
  private data: UserInfo;
  private utms?: Utms;
  private trigger?: string;
  private flowId: string | null = null;
  private flowBeginTime: number | null = null;
  /** Set when an account is mandatory to upload */
  loginRequired = false;

  constructor(
    private readonly storage: Storage,
    private readonly limits: Limits,
    private readonly authConfig?: AuthConfig
  ) {
    this.data = (storage.user as UserInfo | null) || {};
  }

  get info(): UserInfo {
    return this.data || (this.storage.user as UserInfo | null) || {};
  }

  set info(data: UserInfo) {
    this.data = data;
    this.storage.user = data;
  }

  get firstAction(): string | null {
    return this.storage.get('firstAction');
  }

  set firstAction(action: string | null) {
    this.storage.set('firstAction', String(action));
  }

  get surveyed(): boolean {
    return this.storage.get('surveyed') === 'true';
  }

  set surveyed(yes: boolean) {
    this.storage.set('surveyed', String(yes));
  }

  get avatar(): string {
    const defaultAvatar = assets.get('user.svg');
    if (this.info.avatarDefault) {
      return defaultAvatar;
    }
    return this.info.avatar || defaultAvatar;
  }

  get name(): string | undefined {
    return this.info.displayName;
  }

  get email(): string | undefined {
    return this.info.email;
  }

  get loggedIn(): boolean {
    return !!this.info.access_token;
  }

  get bearerToken(): string | undefined {
    return this.info.access_token;
  }

  get refreshToken(): string | undefined {
    return this.info.refresh_token;
  }

  get maxSize(): number {
    return this.limits.MAX_FILE_SIZE;
  }

  get maxExpireSeconds(): number {
    return this.limits.MAX_EXPIRE_SECONDS;
  }

  get maxDownloads(): number {
    return this.limits.MAX_DOWNLOADS;
  }

  private get auth(): AuthConfig {
    if (!this.authConfig) {
      throw new Error('accounts are not configured');
    }
    return this.authConfig;
  }

  async metricId(): Promise<string | undefined> {
    return this.loggedIn && this.info.uid ? hashId(this.info.uid) : undefined;
  }

  async deviceId(): Promise<string> {
    return this.loggedIn ? hashId(this.storage.id) : hashId(anonId);
  }

  startAuthFlow(trigger: string, utms: Utms = {}): void {
    this.utms = utms;
    this.trigger = trigger;
    this.flowId = null;
    this.flowBeginTime = null;
  }

  async login(email?: string | null): Promise<void> {
    const auth = this.auth;
    const state = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));
    this.storage.set('oauthState', state);
    const keys_jwk = await prepareScopedBundleKey(this.storage);
    const code_challenge = await preparePkce(this.storage);
    const options: Record<string, string> = {
      action: 'email',
      access_type: 'offline',
      client_id: auth.client_id,
      code_challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      scope: `profile ${auth.key_scope}`,
      state,
      keys_jwk
    };
    if (email) {
      options.email = email;
    }
    if (this.flowId && this.flowBeginTime) {
      options.flow_id = this.flowId;
      options.flow_begin_time = String(this.flowBeginTime);
    }
    if (this.trigger) {
      options.entrypoint = `send-${this.trigger}`;
    }
    if (this.utms) {
      options.utm_campaign = this.utms.campaign || 'none';
      options.utm_content = this.utms.content || 'none';
      options.utm_medium = this.utms.medium || 'none';
      options.utm_source = this.utms.source || 'send';
      options.utm_term = this.utms.term || 'none';
    }
    const params = new URLSearchParams(options);
    location.assign(`${auth.authorization_endpoint}?${params.toString()}`);
  }

  async finishLogin(code: string, state: string): Promise<void> {
    const auth = this.auth;
    const localState = this.storage.get('oauthState');
    this.storage.remove('oauthState');
    if (!localState || state !== localState) {
      throw new Error('state mismatch');
    }
    const tokenResponse = await fetch(auth.token_endpoint, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        code,
        client_id: auth.client_id,
        code_verifier: this.storage.get('pkceVerifier')
      })
    });
    if (!tokenResponse.ok) {
      throw new Error(String(tokenResponse.status));
    }
    const token = (await tokenResponse.json()) as TokenResponse;
    const infoResponse = await fetch(auth.userinfo_endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });
    const userInfo = (await infoResponse.json()) as UserInfo;
    userInfo.access_token = token.access_token;
    userInfo.refresh_token = token.refresh_token;
    userInfo.fileListKey = await getFileListKey(
      this.storage,
      token.keys_jwe,
      auth.key_scope
    );
    this.info = userInfo;
    this.storage.remove('pkceVerifier');
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshToken || !this.authConfig) {
      return false;
    }
    try {
      const tokenResponse = await fetch(this.authConfig.token_endpoint, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          client_id: this.authConfig.client_id,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        })
      });
      if (tokenResponse.ok) {
        const token = (await tokenResponse.json()) as TokenResponse;
        this.info = { ...this.info, access_token: token.access_token };
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    await this.logout();
    return false;
  }

  async logout(): Promise<void> {
    try {
      if (this.authConfig) {
        const tokens = [
          this.refreshToken && { refresh_token: this.refreshToken },
          this.bearerToken && { token: this.bearerToken }
        ].filter(Boolean);
        await Promise.all(
          tokens.map(body =>
            fetch(this.auth.revocation_endpoint, {
              method: 'POST',
              headers: JSON_HEADERS,
              body: JSON.stringify(body)
            })
          )
        );
      }
    } catch (e) {
      console.error(e);
      // oh well, we tried
    }
    this.storage.clearLocalFiles();
    this.info = {};
  }

  async syncFileList(retried = false): Promise<Partial<MergeResult>> {
    if (!this.loggedIn || !this.info.fileListKey || !this.bearerToken) {
      return this.storage.merge();
    }
    const bearerToken = this.bearerToken;
    let list: OwnedFileData[] = [];
    const key = b64ToArray(this.info.fileListKey);
    const sha = await crypto.subtle.digest('SHA-256', key);
    const kid = arrayToB64(new Uint8Array(sha)).substring(0, 16);
    const retry = async (): Promise<Partial<MergeResult>> => {
      // Only retry once, a token that keeps being refused must not loop
      if (!retried && (await this.refresh())) {
        return this.syncFileList(true);
      }
      return { incoming: true };
    };
    try {
      const encrypted = await getFileList(bearerToken, kid);
      const decrypted = await streamToArrayBuffer(
        decryptStream(blobStream(encrypted), key)
      );
      list = JSON.parse(textDecoder.decode(decrypted)) as OwnedFileData[];
    } catch (e) {
      if ((e as Error).message === '401') {
        return retry();
      }
    }
    const changes = await this.storage.merge(list);
    if (!changes.outgoing) {
      return changes;
    }
    try {
      const blob = new Blob([
        textEncoder.encode(JSON.stringify(this.storage.files))
      ]);
      const encrypted = await streamToArrayBuffer(
        encryptStream(blobStream(blob), key)
      );
      await setFileList(bearerToken, kid, encrypted);
    } catch (e) {
      if ((e as Error).message === '401') {
        return retry();
      }
    }
    return changes;
  }

  toJSON(): UserInfo {
    return this.info;
  }
}
