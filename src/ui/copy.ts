// 畫面上的文字都放這裡。口吻：公會冒險者（不要像客服或 AI）；句子短、直接、不用驚嘆號。
// 要改用詞，改這個檔就好。
// 課程名稱和預設任務名稱在 src/core/templates.ts。

export const COPY = {
  hud: {
    hello: '跟夥伴打招呼',
    toDusk: '等到黃昏',
    toDay: '等到天亮',
  },

  /** 第一次進入：建立 OC */
  join: {
    title: '冒險者登記',
    name: '名字',
    namePlaceholder: (max: number) => `最多 ${max} 個字`,
    pick: '選一位冒險者，或上傳你畫的 OC',
    upload: ['上傳', '我的 OC'] as const,
    uploadAria: '上傳我的 OC（PNG 或 JPG）',
    uploadAlt: '你上傳的 OC',
    processing: '處理中…',
    note: '白底的圖會自動去背。圖只留在這個瀏覽器，不會上傳。',
    submit: '加入公會',
    submitting: '登記中…',
    badType: '請選 PNG 或 JPG 圖片。',
    badImage: '這張圖讀不出來，換一張試試。',
    saveFailed: '登記沒成功，再按一次。',
  },

  /** 委託板 */
  board: {
    title: '委託板',
    newCommission: '接新委託',
    active: (n: number) => `進行中的委託（${n}）`,
    empty: '板子上還沒有委託。',
    done: (n: number) => `完成的委託（${n}）`,
    start: (minutes: number) => `開始任務（${minutes} 分鐘）`,
    resume: '回到任務',
    submit: '交件',
    submitted: '已交件',
    progress: (done: number, total: number) => `進度 ${done}/${total}`,
  },

  /** 接新委託的表單（委託單） */
  form: {
    title: '填委託單',
    course: '課程',
    workTitle: '作業名稱',
    workPlaceholder: (max: number) => `最多 ${max} 個字`,
    due: '期限',
    tasks: (minutes: number) => `任務（每個 ${minutes} 分鐘）`,
    tasksHint: '選好課程，公會會幫你拆成小任務。',
    taskPlaceholder: '任務名稱',
    taskAria: (n: number) => `第 ${n} 個任務`,
    moveUp: (n: number) => `第 ${n} 個任務往前`,
    moveDown: (n: number) => `第 ${n} 個任務往後`,
    remove: (n: number) => `刪掉第 ${n} 個任務`,
    finalStep: '最後一步',
    addTask: '＋ 加一個任務',
    accept: '接下委託',
    accepting: '登記中…',
    cancel: '先不接',
    saveFailed: '委託單沒貼上去，再按一次。',
    problems: {
      course: '還沒選課程。',
      title: '委託單上還沒寫作業名稱。',
      due: '還沒定期限。',
      taskTitle: '有任務還沒取名字。',
    },
  },

  /** 任務計時 */
  timer: {
    step: (n: number, total: number) => `第 ${n}/${total} 個任務`,
    backToLobby: '回大廳',
    pause: '休息一下',
    resume: '繼續任務',
    finishEarly: '提早完成',
    extend: (minutes: number) => `再 ${minutes} 分鐘`,
    paused: '休息中',
    timeUp: '時間到',
    askDone: '這個任務完成了嗎？',
    done: '完成了',
    failed: '沒記到，再按一次。',
  },

  /** 主角頭上的對話泡泡 */
  speech: {
    taskDone: '任務完成！',
  },

  dialog: {
    close: '關閉',
  },

  /** 讀存檔失敗（不會讓玩家重新登記，免得蓋掉舊存檔） */
  loadError: '讀不到存檔。請重新整理，還是不行的話請聯絡組員。',
};
