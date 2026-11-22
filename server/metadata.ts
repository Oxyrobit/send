/** The raw hash stored in redis for every upload. */
export interface StoredMetadata {
  dl?: string | number;
  dlimit?: string | number;
  pwd?: string | boolean;
  owner?: string;
  metadata?: string;
  auth?: string;
  nonce?: string;
  prefix?: string;
}

export default class Metadata {
  readonly dl: number;
  readonly dlimit: number;
  readonly pwd: boolean;
  readonly owner: string;
  readonly metadata: string;
  readonly auth: string;
  readonly nonce: string;

  constructor(obj: StoredMetadata) {
    this.dl = +(obj.dl || 0) || 0;
    this.dlimit = +(obj.dlimit || 0) || 1;
    this.pwd = String(obj.pwd) === 'true';
    this.owner = obj.owner || '';
    this.metadata = obj.metadata || '';
    this.auth = obj.auth || '';
    this.nonce = obj.nonce || '';
  }
}
