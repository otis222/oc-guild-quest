// 資料結構（企劃表 7.2）。改結構時：GuildState.version 加一，並在 state.ts 補一個 migration。

export type CourseType = 'typography' | 'color' | 'composition' | 'drawing';

export interface Level {
  id: string;
  title: string;
  minutes: number;            // 預設 10；交件關為 0
  kind: 'timed' | 'submit';
  status: 'todo' | 'doing' | 'done';
  startedAt?: number;         // 這次開始的時間戳
  pausedMs: number;           // 累計暫停
  focusMs: number;            // 實際專注時間
  doneAt?: number;
  pausedAt?: number;          // 正在暫停的話，是從什麼時候開始暫停（T4 加的，7.2 沒有；沒有這欄就是沒暫停）
}

export interface Commission {
  id: string;
  course: CourseType;
  title: string;              // 作業名稱
  createdAt: number;
  dueAt: number;
  levels: Level[];            // 5 個 timed＋1 個 submit
  submittedAt?: number;
  photoId?: string;           // 交件照片
  cellIndex: number;          // 佔設定卡該區的第幾格（0–2，滿了往下一輪）
}

export interface OCProfile {
  name: string;
  sprite: string;             // 選的 AI 小人檔名（例：maid_1.png），或上傳圖的 id（upload:<id>）
  palette?: string[];         // 色彩學交件後的 5 個色
  nameplatePhotoId?: string;  // 字體設計
  layoutPhotoId?: string;     // 平面構成
  sketchPhotoId?: string;     // 手繪基礎
}

export interface GuildState {
  version: 1;
  createdAt: number;
  oc: OCProfile;
  commissions: Commission[];
  guildLevel: number;
  exhibits: string[];         // 展品照片 id，最近 5 張
}

export type EventType =
  | 'app_opened' | 'oc_created' | 'commission_created' | 'level_started'
  | 'level_paused' | 'level_resumed' | 'level_extended' | 'level_completed'
  | 'photo_added' | 'commission_submitted' | 'oc_card_opened' | 'exhibit_opened';

export interface LogEvent {
  t: number;
  type: EventType;
  commissionId?: string;
  levelId?: string;
  data?: Record<string, unknown>;
}
