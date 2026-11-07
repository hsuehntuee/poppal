/** 服務代號：A～Y 是服務，Z 是「都不是」 */
export type Code = string;

export type RouteType = 'internal' | 'external' | 'phone' | 'unavailable';

export interface ServiceEntry {
  id: string;
  code: Code;
  title: Record<string, string>;
  desc: string;
  keywords: string[];
  examples: string[];
  route: { type: RouteType; target?: string };
  guide_id?: string;
}

/** 決策器的一個選項（服務或指令都用這個） */
export interface Option {
  code: Code;
  id?: string;
  label: string;
  desc: string;
  examples?: string[];
  keywords?: string[];
}

export interface CommandOption extends Option {
  id: string;
}

export interface Catalog {
  version: string;
  none_code: Code;
  instruction: string;
  services: ServiceEntry[];
  commands: { instruction: string; none_code: Code; options: CommandOption[] };
}

/** 一次評分請求：文字 + 選項集 + 說明 */
export interface ScoreRequest {
  text: string;
  options: Option[];
  instruction: string;
  /** 「都不是」的代號，一定要在 options 裡 */
  noneCode: Code;
  /** 給步驟內指令用：目前這一步在做什麼 */
  context?: string;
  /** 選項集的識別名稱，讓引擎可以快取固定前綴 / 例句向量 */
  setId?: string;
}

export type Probs = Record<Code, number>;

export interface Decider {
  readonly name: string;
  /** 準備模型 / 暖機 KV cache。可以多次呼叫 */
  ready(setup?: { sets: Array<Pick<ScoreRequest, 'options' | 'instruction' | 'noneCode' | 'setId'>> }): Promise<void>;
  /** 回傳每個代號的機率，加總為 1 */
  score(req: ScoreRequest): Promise<Probs>;
  /** 引擎的補充資訊（模型名稱、網址…） */
  info(): Record<string, string | number | boolean>;
}

export type Decision =
  | { kind: 'GO'; code: Code; p: number }
  | { kind: 'ASK'; codes: Code[]; p: number }
  | { kind: 'NONE'; p: number };

export interface Thresholds {
  go: number;
  ask2: number;
  ask3: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { go: 0.75, ask2: 0.75, ask3: 0.75 };
