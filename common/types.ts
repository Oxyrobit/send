// Types shared by the server, the browser app and the service worker.

export interface Limits {
  MAX_FILE_SIZE: number;
  MAX_DOWNLOADS: number;
  MAX_EXPIRE_SECONDS: number;
  MAX_FILES_PER_ARCHIVE: number;
  MAX_ARCHIVES_PER_USER: number;
}

export interface CustomAssets {
  android_chrome_192px: string;
  android_chrome_512px: string;
  apple_touch_icon: string;
  favicon_16px: string;
  favicon_32px: string;
  icon: string;
  safari_pinned_tab: string;
  facebook: string;
  twitter: string;
  wordmark: string;
  custom_css: string;
}

export interface WebUI {
  FOOTER_DONATE_URL: string;
  FOOTER_CLI_URL: string;
  FOOTER_DMCA_URL: string;
  FOOTER_SOURCE_URL: string;
  CUSTOM_FOOTER_TEXT: string;
  CUSTOM_FOOTER_URL: string;
  MAIN_NOTICE_HTML: string;
  UPLOAD_AREA_NOTICE_HTML: string;
  UPLOADS_LIST_NOTICE_HTML: string;
  DOWNLOAD_NOTICE_HTML: string;
  SHOW_THUNDERBIRD_SPONSOR: boolean;
  COLORS: { PRIMARY: string; ACCENT: string };
  CUSTOM_ASSETS: CustomAssets;
}

export interface Defaults {
  DOWNLOADS: number;
  DOWNLOAD_COUNTS: number[];
  EXPIRE_TIMES_SECONDS: number[];
  EXPIRE_SECONDS: number;
}

export interface Prefs {
  surveyUrl?: string;
}

export interface AuthConfig {
  client_id: string;
  key_scope: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  jwks_uri: string;
  [key: string]: unknown;
}

export type TranslateData = Record<string, string | number>;
export type Translate = (id: string, data?: TranslateData) => string;

export interface ManifestFile {
  name: string;
  size: number;
  type: string;
}

export interface Manifest {
  files: ManifestFile[];
}
