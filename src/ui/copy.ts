// 畫面上的文字都放這裡。口吻：公會冒險者（不要像客服或 AI）；句子短、直接、不用驚嘆號。
// 要改用詞，改這個檔就好。
// 課程名稱、部位名稱（名牌、配色…）和預設任務名稱在 src/core/templates.ts。

/** 畫圖時間有多少：整分鐘寫「15 分鐘」，有零頭寫「12 分 30 秒」（秒數無條件捨去） */
const drawAmount = (ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / 1000), m = Math.floor(total / 60), s = total % 60;
  return s ? `${m} 分 ${s} 秒` : `${m} 分鐘`;
};

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
    /** 完成任務後直接接下一關（T10） */
    nextTask: (minutes: number) => `下一個任務（${minutes} 分鐘）`,
    nextSubmit: '交件',
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

  /** 公會作品集（T15） */
  gallery: {
    /** 設定卡上的按鈕 */
    open: (n: number) => `作品集（${n}）`,
    title: (n: number) => `公會作品集（${n}）`,
    empty: '還沒有作品。交件後，作業照片會放在這裡。',
    date: (md: string) => `${md} 交件`,
    onExhibit: '展台上',
    missing: '讀不到照片',
    itemAria: (course: string, work: string, md: string, onExhibit: boolean) =>
      `${course}・${work}，${md} 交件${onExhibit ? '，在大廳展台上' : ''}`,
    /** 放大看大廳展品時的按鈕 */
    all: '看全部作品',
  },

  /** 放大看照片 */
  viewer: {
    exhibit: '公會展品',
    work: '交件的作業',
    caption: (course: string, work: string, md: string) => `${course}・${work}　${md} 交件`,
  },

  /** 加分關（T9 設定圖急救是平面構成的；下面的分數、結果、按鈕三種加分關共用） */
  bonus: {
    /** 委託卡上的按鈕（部位是版面、配色、名牌的委託，計時任務都完成以後才有） */
    button: (best?: number) => (best === undefined ? '加分關' : `加分關 ${best} 分`),
    title: '設定圖急救',
    hint: '設定圖亂掉了。把小卡拖進格線排好。',
    keysHint: '選一張小卡，用方向鍵一次移一格。',
    sheetAria: 'OC 設定圖的格線',
    cards: { name: '名字', quote: '台詞', front: '正面', side: '側面', back: '背面' },
    cardAt: (card: string, col: number, row: number) => `${card}：第 ${col} 欄、第 ${row} 列`,
    cardLoose: (card: string) => `${card}：還沒放進格線`,
    /** 台詞卡上還沒寫的時候 */
    quoteEmpty: '（寫一句台詞）',
    quote: '台詞',
    quotePlaceholder: (max: number) => `OC 的一句話，最多 ${max} 字`,
    now: (score: number) => `目前 ${score} 分`,
    groups: { align: '對齊', space: '留白' },
    rules: {
      feet: '三視圖腳底對齊',
      text: '名字和台詞對齊',
      spacing: '三視圖等距排開',
      overlap: '小卡沒有疊在一起',
      breath: '文字和三視圖隔一格',
      close: '名字和台詞靠在一起',
    },
    ruleDone: '做到了',
    ruleTodo: '還沒做到',
    alignNote: '對齊可以靠左、置中或靠右。',
    finish: '完成排版',
    finishing: '計分中…',
    loose: (n: number) => `還有 ${n} 張小卡沒放進格線。`,
    cancel: '先不玩',
    score: (score: number) => `${score} 分`,
    result: {
      perfect: '設定圖救回來了。對齊和留白都到位。',
      good: '差一點就滿分。看看還沒打勾的那幾項。',
      retry: '還有幾張小卡沒站好。照沒打勾的再排一次。',
    },
    best: (score: number) => `這張委託的加分關最高 ${score} 分`,
    again: '再排一次',
    back: '回委託板',
    saveFailed: '分數沒記到，再按一次。',
  },

  /** OC 設定圖成品（企劃表 T18） */
  charSheet: {
    /** 設定卡上的按鈕 */
    open: '看設定圖',
    title: 'OC 設定圖',
    drawing: '正在畫設定圖…',
    failed: '設定圖沒畫出來。關掉再開一次試試。',
    alt: (name: string) => `${name}的 OC 設定圖：名字、台詞、三視圖、配色、版面、草稿`,
    save: '存成圖片',
    note: '圖片在這台裝置上做好，不會上傳。',
    shared: '分享好了。',
    downloaded: '圖片下載好了。',
    saveFailed: '沒存成功，再按一次。',
    // 下面是畫在設定圖上的字
    heading: 'OC 設定圖',
    level: (n: number) => `公會等級 ${n}`,
    quoteEmpty: '（還沒有台詞）',
    missing: (course: string) => `交${course}作業後出現`,
    footer: (date: string) => `公會委託單・${date}`,
  },

  /** 作業換畫圖時間（企劃表 T17）：完成一個任務存 5 分鐘 */
  draw: {
    title: '畫圖時間',
    heading: '畫自己想畫的',
    bank: (ms: number) => `存了 ${drawAmount(ms)}`,
    planned: (ms: number) => `這次可以畫 ${drawAmount(ms)}`,
    none: '完成一個任務，存 5 分鐘。',
    drawingNow: '畫圖中',
    start: '開始畫圖',
    back: '回到畫圖',
    pause: '休息一下',
    resume: '繼續畫圖',
    finishEarly: '提早結束',
    paused: '休息中',
    timeUp: '時間到',
    timeUpNote: '畫圖時間用完了。完成任務可以再存。',
    done: '回大廳',
    failed: '沒記到，再按一次。',
    /** 完成任務後的小提示 */
    earned: (min: number, bankMs: number) => `畫圖時間 +${min} 分鐘・存了 ${drawAmount(bankMs)}`,
    /** 開始畫圖時主角說的話 */
    speech: '來畫圖吧',
  },

  /** 色彩學的加分關：配色急救（企劃表 T16） */
  paletteGame: {
    title: '配色急救',
    hint: '設定圖的顏色亂掉了。幫每個地方選一個顏色。',
    previewAria: '配色預覽：OC 設定圖',
    /** 小設定圖上還沒寫台詞時的那一行 */
    sample: 'OC 設定圖',
    roles: { bg: '背景', text: '文字', main: '主色', accent: '強調色' },
    roleAria: (role: string) => `${role}的顏色`,
    ocColor: (i: number) => `OC 的顏色 ${i}`,
    neutrals: ['白', '灰', '黑'],
    ocNote: '前面幾色是從 OC 圖上抽出來的，後面是白、灰、黑。',
    groups: { value: '明度對比', color: '色彩搭配' },
    rules: {
      read: '文字看得清楚',
      figure: '主色從背景跳出來',
      mark: '強調色從背景跳出來',
      quiet: '背景不搶戲',
      own: '主色強調色來自 OC',
      pop: '強調色比主色鮮豔',
    },
    note: '文字和背景的明度對比要 4.5 以上，主色、強調色和背景 3 以上。背景用白、灰、黑或很淡的顏色。',
    finish: '完成配色',
    again: '再配一次',
    result: {
      perfect: '配色救回來了。看得清楚，也有重點。',
      good: '差一點就滿分。看看還沒打勾的那幾項。',
      retry: '顏色還在打架。照沒打勾的再配一次。',
    },
  },

  /** 字體設計的加分關：名牌急救（企劃表 T16） */
  plateGame: {
    title: '名牌急救',
    hint: '名牌上的字亂掉了。把每個字拖整齊。',
    keysHint: '選一個字，用方向鍵一次移一小格。',
    plateAria: 'OC 的名牌',
    glyph: (ch: string, i: number, n: number) => `第 ${i}/${n} 個字「${ch}」`,
    groups: { line: '對齊', space: '字距' },
    rules: {
      baseline: '對齊基線',
      center: '名字在正中間',
      even: '字距平均',
      comfy: '字距不擠也不鬆',
    },
    note: '一小格是四分之一個字。字距一到三小格剛好。',
    finish: '完成名牌',
    again: '再排一次',
    result: {
      perfect: '名牌救回來了。字排得很整齊。',
      good: '差一點就滿分。看看還沒打勾的那幾項。',
      retry: '字還沒站好。照沒打勾的再排一次。',
    },
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
    /** 交件後公會成員圍觀新展品時說的話（T14），每人挑一句 */
    admire: ['好看', '新的展品耶', '交件辛苦了', '這是什麼作業？', '我也要加油'],
  },

  dialog: {
    close: '關閉',
  },

  /** 研究模式（給研究者看，不是玩家畫面，用一般說法） */
  research: {
    button: '研究模式',
    title: '研究模式',
    note: '給 Playtest 記錄用。網址加 ?research=1 才看得到入口；資料都在這台裝置的瀏覽器裡。',
    loadFailed: '研究資料讀不出來，請重新整理再試一次。',
    noState: '還沒有存檔（還沒建立 OC）。',
    badState: (msg: string) => `存檔讀不懂（${msg}）。指標算不出來，但還是可以匯出 JSON 救資料。`,
    oc: 'OC',
    ocValue: (name: string, level: number) => `${name}（公會等級 ${level}）`,
    commissions: '委託',
    commissionsValue: (n: number, submitted: number) => `${n} 張（交件 ${submitted} 張）`,
    events: '事件',
    eventsValue: (n: number, first: string, last: string) => (n ? `${n} 筆（${first} ～ ${last}）` : '0 筆'),
    cardOpened: '打開設定卡',
    cardOpenedValue: (n: number, hud: number, toast: number) => `${n} 次（底部按鈕 ${hud}、小提示 ${toast}）`,
    exportCsv: '匯出事件 CSV',
    exportJson: '匯出完整 JSON',
    exportNote: '作業照片和上傳的 OC 圖不會匯出。Playtest 期間建議每 2～3 天匯出一次。',
    metricsTitle: '每張委託的指標（企劃表 7.6）',
    noCommissions: '還沒有委託。',
    submitted: '已交件',
    active: '進行中',
    overdue: '已逾期',
    lead: '提早開工',
    leadValue: (h: number | null) => (h === null ? '還沒開工' : `${h.toFixed(1)} 小時`),
    beforeLastNight: '最後一晚前完成',
    beforeLastNightValue: (done: number, total: number) => `${done}／${total}（${total ? Math.round((done / total) * 100) : 0}%）`,
    focus: '每關專注（分鐘）',
    focusValue: (mins: readonly (number | null)[]) => mins.map((m) => (m === null ? '—' : m.toFixed(1))).join('・'),
    startsPauses: '開工／暫停',
    startsPausesValue: (starts: number, pauses: number) => `${starts} 次／${pauses} 次`,
    submitLead: '交件距截止',
    submitLeadValue: (h: number | null) => (h === null ? '還沒交件' : h >= 0 ? `提早 ${h.toFixed(1)} 小時` : `逾期 ${(-h).toFixed(1)} 小時`),
    eventsTitle: (n: number) => `事件列表（${n} 筆，新的在上面）`,
    clear: '清除全部資料',
    clearConfirm: '確定要清除嗎？OC、委託、照片和事件紀錄都會刪掉，不能復原。清除前記得先匯出。',
    clearYes: '確定清除',
    clearNo: '先不要',
    clearing: '清除中…',
    clearFailed: '沒有清除成功，再試一次。',
  },

  /** 讀存檔失敗（不會讓玩家重新登記，免得蓋掉舊存檔） */
  loadError: '讀不到存檔。請重新整理，還是不行的話請聯絡組員。',
  /** 瀏覽器不支援 WebGL2（企劃表 T8：不要白畫面） */
  noWebGL: '這個瀏覽器進不了公會大廳（需要 WebGL2）。請用新版的 Chrome、Safari 或 Edge 打開。',
  /** 其他啟動失敗（例如小人圖的清單讀不到） */
  startFailed: '公會大廳沒有開起來。請重新整理，還是不行的話請聯絡組員。',
};
