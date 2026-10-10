// 畫面上的文字都放這裡。口吻：公會冒險者（不要像客服或 AI）；句子短、直接、不用驚嘆號。
// 要改用詞，改這個檔就好。
// 課程名稱、部位名稱（名牌、配色…）和預設任務名稱在 src/core/templates.ts。

export const COPY = {
  hud: {
    hello: '跟夥伴打招呼',
    toDusk: '等到黃昏',
    toDay: '等到天亮',
    /** 大廳招牌旁等級牌上的字 */
    guildLevel: '公會等級',
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
    newCourse: '＋ 新課程',
    courseName: '課程名稱',
    courseNamePlaceholder: (max: number) => `最多 ${max} 個字`,
    coursePart: '交件後解鎖',
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
      courseName: '新課程還沒取名字。',
      courseTaken: '公會已經有這門課了，直接從上面選。',
      coursePart: '還沒選交件後要解鎖什麼。',
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

  /** OC 設定卡 */
  card: {
    title: 'OC 設定卡',
    guildLevel: (n: number) => `公會等級 ${n}`,
    completion: (pct: number) => `完成度 ${pct}%`,
    changeLook: '換造型',
    unlocks: (part: string) => `交件後解鎖：${part}`,
    /** 企劃表 T5 指定的說法 */
    emptyCell: (course: string) => `接一張${course}委託來點亮`,
    sliceDone: (md: string, course: string, task: string, work: string) => `${md} ${course}・${task}（${work}）`,
    sliceTodo: (task: string, work: string) => `${task}・還沒完成（${work}）`,
    pieLabel: (course: string, work: string, done: number, total: number) => `${course}・${work}，${done}/${total}`,
    history: (n: number) => `歷史（${n}）`,
    historyItem: (work: string, done: number, total: number, submitted: boolean) => `${work}　${done}/${total}${submitted ? '・已交件' : ''}`,
    /** OC 目前的部件（名牌、配色、版面、草稿）；還沒有的格子 */
    partsAria: 'OC 的部件',
    partEmpty: '還沒有',
    /** 交件的格子中間：點了放大看照片 */
    openResult: (work: string) => `看「${work}」交的作業`,
  },

  /** 完成任務、交件後大廳的小提示 */
  toast: {
    lit: '設定卡亮了一片',
    detail: (course: string, work: string, done: number, total: number) => `${course}・${work}　${done}/${total}`,
    submitted: '交件完成',
    submittedDetail: (work: string, level: number) => `公會等級 ${level}・${work}`,
    /** 企劃表 7.7 的按鈕範例 */
    open: '看 OC 設定卡',
  },

  /** 交件 */
  submit: {
    title: '交件',
    hint: '拍下完成的作業，交給公會。',
    camera: '拍照',
    album: '從相簿選',
    processing: '整理照片中…',
    photoAlt: (work: string) => `「${work}」的作業照片`,
    paletteLabel: 'OC 的新配色',
    nameplateLabel: '拖曳框框，框出你的名牌',
    nameplateSize: '框的大小',
    nameplatePreview: '名牌預覽',
    layoutNote: '這張照片會變成設定卡上的版面縮圖。',
    sketchNote: '這張照片會放進設定卡的草稿格。',
    confirm: '交件',
    confirming: '交件中…',
    retake: '換一張',
    note: '照片只存在這個瀏覽器，不會上傳。',
    badImage: '這張照片讀不出來，換一張試試。',
    saveFailed: '交件沒成功，再按一次。',
  },

  /** 放大看照片 */
  viewer: {
    exhibit: '公會展品',
    work: '交件的作業',
    caption: (course: string, work: string, md: string) => `${course}・${work}　${md} 交件`,
  },

  /** 換造型 */
  look: {
    title: '換造型',
    pick: '選一位冒險者，或上傳你畫的 OC',
    save: '就用這個',
    saving: '換裝中…',
    cancel: '先不換',
    saveFailed: '沒換成功，再按一次。',
  },

  /** 主角頭上的對話泡泡 */
  speech: {
    taskDone: '任務完成！',
    /** 企劃表 7.7 的台詞範例 */
    submitted: '交件了！',
  },

  dialog: {
    close: '關閉',
  },

  /** 讀存檔失敗（不會讓玩家重新登記，免得蓋掉舊存檔） */
  loadError: '讀不到存檔。請重新整理，還是不行的話請聯絡組員。',
  /** 瀏覽器不支援 WebGL2（企劃表 T8：不要白畫面） */
  noWebGL: '這個瀏覽器進不了公會大廳（需要 WebGL2）。請用新版的 Chrome、Safari 或 Edge 打開。',
  /** 其他啟動失敗（例如小人圖的清單讀不到） */
  startFailed: '公會大廳沒有開起來。請重新整理，還是不行的話請聯絡組員。',
};
