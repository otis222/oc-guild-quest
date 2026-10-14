import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvCell, eventsCsv, EVENT_LABELS, exportFileName, exportJson, localTime } from '../../src/core/exportData';
import { addCommission, createGuildState } from '../../src/core/state';
import { templateLevels } from '../../src/core/templates';
import type { EventType, LogEvent } from '../../src/core/types';

const s = addCommission(createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 0),
  { course: 'color', title: '色相環, 第一版', dueAt: 9e12, levels: templateLevels('color') }, 1, 'c1');
const levelId = s.commissions[0].levels[0].id;
const at = new Date(2026, 9, 10, 14, 3, 5).getTime();
const events: LogEvent[] = [
  { t: at, type: 'app_opened' },
  { t: at + 1000, type: 'level_started', commissionId: 'c1', levelId, data: { minutes: 10 } },
];

describe('CSV 匯出（一列一個事件）', () => {
  it('開頭有 BOM、換行是 CRLF，第一列是標題', () => {
    const csv = eventsCsv(s, events);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines).toHaveLength(events.length + 2);
    expect(lines.at(-1)).toBe('');
  });

  it('每一列：當地時間、中文事件名、事件代碼、委託、課程、任務、資料、id、時間戳', () => {
    const line = eventsCsv(s, events).slice(1).split('\r\n')[2];
    expect(line).toBe(`2026-10-10 14:03:06,開始任務,level_started,"色相環, 第一版",色彩學,讀要求選主題,"{""minutes"":10}",c1,${levelId},${at + 1000}`);
  });

  it('沒有存檔（讀不到）也能匯出事件，名稱欄留空', () => {
    const line = eventsCsv(null, events).slice(1).split('\r\n')[2];
    expect(line.startsWith('2026-10-10 14:03:06,開始任務,level_started,,,,')).toBe(true);
  });

  it('一格裡有逗號、引號、換行就加引號；開頭像公式的前面加 \'', () => {
    expect(csvCell('普通')).toBe('普通');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('他說"好"')).toBe('"他說""好"""');
    expect(csvCell('兩\n行')).toBe('"兩\n行"');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(12)).toBe('12');
  });

  it('每種事件都有中文名稱', () => {
    const all: EventType[] = ['app_opened', 'oc_created', 'commission_created', 'level_started', 'level_paused', 'level_resumed',
      'level_extended', 'level_completed', 'photo_added', 'commission_submitted', 'oc_card_opened', 'exhibit_opened', 'oc_changed', 'course_created',
      'bonus_started', 'bonus_finished', 'gallery_opened', 'draw_started', 'draw_finished', 'sheet_opened', 'sheet_saved'];
    expect(all.every((t) => EVENT_LABELS[t].length > 0)).toBe(true);
  });

  it('時間是裝置的當地時間', () => {
    expect(localTime(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('2026-01-02 03:04:05');
  });
});

describe('JSON 匯出（完整狀態＋事件＋指標）', () => {
  it('讀得懂的存檔：有狀態、事件、指標、匯出時間', () => {
    const data = JSON.parse(exportJson(s, s, events, at));
    expect(data).toMatchObject({ app: 'oc-guild-quest', exportedAt: new Date(at).toISOString() });
    expect(data.state).toEqual(s);
    expect(data.events).toEqual(events);
    expect(data.metrics.commissions[0]).toMatchObject({ commissionId: 'c1', starts: 1 });
  });

  it('存檔壞掉：照原樣匯出，沒有指標', () => {
    const data = JSON.parse(exportJson({ version: 99, junk: true }, null, events, at));
    expect(data.state).toEqual({ version: 99, junk: true });
    expect(data.metrics).toBeNull();
  });

  it('檔名帶日期時間', () => {
    expect(exportFileName('events', 'csv', at)).toBe('oc-guild-quest-events-20261010-1403.csv');
    expect(exportFileName('data', 'json', at)).toBe('oc-guild-quest-data-20261010-1403.json');
  });
});
