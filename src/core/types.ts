// 資料結構（企劃表 7.2）。改結構時：GuildState.version 加一，並在 state.ts 補一個 migration。

/** 內建的 4 門課（企劃表 7.3） */
export type CourseType = 'typography' | 'color' | 'composition' | 'drawing';
/** 玩家在委託單上自己加的課程 */
export type CustomCourseId = `custom:${string}`;
/** 委託屬於哪門課：內建課程或自訂課程 */
export type CourseId = CourseType | CustomCourseId;
/** 交件後作業成果變成 OC 的哪個部分：名牌、配色、版面、草稿（T6 依這個產生部件） */
export type PartType = 'nameplate' | 'palette' | 'layout' | 'sketch';

/** 自訂課程（10/10 組員要求，7.2 沒有）：名稱由玩家取，交件後的部位從 4 種選一種 */
export interface CustomCourse {
  id: CustomCourseId;
  label: string;
  part: PartType;
  createdAt: number;
}

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
  course: CourseId;
  title: string;              // 作業名稱
  createdAt: number;
  dueAt: number;
  levels: Level[];            // 5 個 timed＋1 個 submit
  submittedAt?: number;
  photoId?: string;           // 交件照片
  palette?: string[];         // 部位是配色：交件照片抽出的色（T6 加的，7.2 沒有）
  nameplatePhotoId?: string;  // 部位是名牌：從交件照片裁出來的名牌圖（T6 加的，7.2 沒有）
  bonusBest?: number;         // 部位是版面：加分關（設定圖急救）的最高分 0–100（T9 加的，7.2 沒有）
  cellIndex: number;          // 佔設定卡該區的第幾格（0–2，滿了往下一輪）
}

/** 設定圖急救（T9）的小卡：名字、台詞、正面、側面、背面 */
export type SheetCardId = 'name' | 'quote' | 'front' | 'side' | 'back';
/** 每張小卡在 8×10 格線上的位置（左上角，第幾欄、第幾列，0 起算） */
export type SheetPositions = Readonly<Record<SheetCardId, { readonly x: number; readonly y: number }>>;

export interface OCProfile {
  name: string;
  sprite: string;             // 選的 AI 小人檔名（例：maid_1.png），或上傳圖的 id（upload:<id>）
  // 下面 4 個是 OC 目前的部件：部位一樣的課程（內建或自訂）最近一次交件的成果
  palette?: string[];         // 配色（色彩學）：照片抽出的色，最多 5 個
  nameplatePhotoId?: string;  // 名牌（字體設計）
  layoutPhotoId?: string;     // 版面（平面構成）
  sketchPhotoId?: string;     // 草稿（手繪基礎）
  quote?: string;             // OC 的台詞：設定圖急救的台詞卡，玩家自己寫（T9 加的，7.2 沒有）
  /** 設定圖急救排得最好的那次（分數一樣留新的）：OC 設定圖成品照這個排（T18 加的，7.2 沒有） */
  sheetBest?: { positions: SheetPositions; score: number; at: number };
}

/** 正在畫圖（T17，7.2 沒有）：跟任務一樣用時間戳算，重新整理也不會歸零 */
export interface DrawSession {
  startedAt: number;
  /** 這次可以畫多久：開始時存著的畫圖時間全部拿出來 */
  plannedMs: number;
  /** 累計休息 */
  pausedMs: number;
  /** 正在休息的話，從什麼時候開始 */
  pausedAt?: number;
  /** 休息了幾次 */
  pauses: number;
}

/** 專屬小人（T19，7.2 沒有）：送給組員做的 OC 小人 */
export interface ChibiState {
  /** 送出了、還沒領到：領取碼和送出的時間 */
  request?: { code: string; requestedAt: number };
  /** 最近一次領到的小人圖（photo id）；換造型換掉以後還可以再換回來 */
  photoId?: string;
  receivedAt?: number;
}

export interface GuildState {
  version: 2;
  createdAt: number;
  oc: OCProfile;
  commissions: Commission[];
  guildLevel: number;
  exhibits: string[];         // 展品照片 id，最近 5 張；第 i 張放在第 i 個展品位置（submit.ts、scene/exhibits.ts）
  customCourses: CustomCourse[]; // 自訂課程，照建立順序（第 2 版加的）
  drawUsedMs?: number;        // 已經用掉的畫圖時間（T17 加的，7.2 沒有；存了多少用算的，見 drawTime.ts）
  drawing?: DrawSession;      // 正在畫圖（T17 加的，7.2 沒有）
  chibi?: ChibiState;         // 專屬小人（T19 加的，7.2 沒有）
}

export type EventType =
  | 'app_opened' | 'oc_created' | 'commission_created' | 'level_started'
  | 'level_paused' | 'level_resumed' | 'level_extended' | 'level_completed'
  | 'photo_added' | 'commission_submitted' | 'oc_card_opened' | 'exhibit_opened'
  | 'oc_changed'               // T5 加的：在設定卡換造型（7.2 沒有）
  | 'course_created'           // 接委託時新增自訂課程（7.2 沒有）
  | 'bonus_started'            // T9 加的：開始一局加分關（設定圖急救）（7.2 沒有）
  | 'bonus_finished'           // T9 加的：加分關按「完成排版」計分（7.2 沒有）
  | 'gallery_opened'           // T15 加的：打開公會作品集（7.2 沒有）
  | 'draw_started'             // T17 加的：開始畫圖（7.2 沒有）
  | 'draw_finished'            // T17 加的：結束畫圖（提早結束、時間到、開始任務）（7.2 沒有）
  | 'sheet_opened'             // T18 加的：打開 OC 設定圖成品（7.2 沒有）
  | 'sheet_saved'              // T18 加的：把 OC 設定圖存成圖片（7.2 沒有）
  | 'chibi_requested'          // T19 加的：把 OC 圖送給組員做專屬小人（7.2 沒有）
  | 'chibi_received';          // T19 加的：領到專屬小人（7.2 沒有）

export interface LogEvent {
  t: number;
  type: EventType;
  commissionId?: string;
  levelId?: string;
  data?: Record<string, unknown>;
}
