// 研究模式的面板（企劃表 T7）：摘要、7.6 的指標（每張委託一張卡）、匯出 CSV／JSON、事件列表、清除全部資料。
// 只在網址有 ?research=1 時才會被載入（main.ts 用 import() 按需載入），一般玩家的網頁不會帶到這段程式。
import { isOverdue } from '../core/due';
import { EVENT_LABELS, eventsCsv, exportFileName, exportJson, localTime } from '../core/exportData';
import { computeMetrics, type CommissionMetrics, type Metrics } from '../core/metrics';
import { loadResearchData, type ResearchData } from '../core/research';
import type { KV } from '../core/storage';
import type { GuildState, LogEvent } from '../core/types';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';

const R = COPY.research;

export interface ResearchDeps {
  kv: KV;
  /** 清除全部資料之後（重新整理頁面，回到建立 OC） */
  onCleared(): void;
}

/** 下載一個文字檔（只存到這台裝置，不會上傳） */
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const row = (label: string, value: string): HTMLElement[] => [el('dt', {}, label), el('dd', {}, value)];

function summary(d: ResearchData, m: Metrics | null): HTMLElement {
  const s = d.state;
  const first = d.events[0], last = d.events.at(-1);
  const items: HTMLElement[] = [];
  if (s) {
    items.push(...row(R.oc, R.ocValue(s.oc.name, s.guildLevel)));
    items.push(...row(R.commissions, R.commissionsValue(s.commissions.length, s.commissions.filter((c) => c.submittedAt !== undefined).length)));
  }
  items.push(...row(R.events, R.eventsValue(d.events.length, first ? localTime(first.t) : '', last ? localTime(last.t) : '')));
  if (m) items.push(...row(R.cardOpened, R.cardOpenedValue(m.ocCardOpened, m.ocCardOpenedVia.hud ?? 0, m.ocCardOpenedVia.toast ?? 0)));
  return el('dl', { class: 'rs-summary' }, ...items);
}

function metricCard(m: CommissionMetrics, now: number): HTMLElement {
  const status = m.submitted ? R.submitted : isOverdue(m.dueAt, now) ? R.overdue : R.active;
  return el('li', { class: 'rs-metric' },
    el('div', { class: 'rs-metric-head' }, el('strong', {}, `${m.course}・${m.title}`), el('span', {}, status)),
    el('dl', {},
      ...row(R.lead, R.leadValue(m.leadHours)),
      ...row(R.beforeLastNight, R.beforeLastNightValue(m.doneBeforeLastNight, m.timedTotal)),
      ...row(R.focus, R.focusValue(m.focusMinutes)),
      ...row(R.startsPauses, R.startsPausesValue(m.starts, m.pauses)),
      ...row(R.submitLead, R.submitLeadValue(m.submitLeadHours))));
}

/** 事件列表的一列：時間、事件、哪張委託的哪個任務、附帶資料 */
function eventRow(s: GuildState | null, e: LogEvent): HTMLLIElement {
  const c = s?.commissions.find((x) => x.id === e.commissionId);
  const task = c?.levels.find((l) => l.id === e.levelId)?.title;
  const where = c ? [c.title, task].filter(Boolean).join('・') : '';
  return el('li', {},
    el('span', { class: 'rs-time' }, localTime(e.t)),
    el('span', { class: 'rs-type' }, EVENT_LABELS[e.type] ?? e.type),
    where ? el('span', { class: 'rs-where' }, where) : null,
    e.data ? el('code', {}, JSON.stringify(e.data)) : null);
}

export async function openResearch(deps: ResearchDeps): Promise<void> {
  let data: ResearchData;
  try {
    data = await loadResearchData(deps.kv);
  } catch (err) {
    console.error('研究資料讀取失敗', err);
    openDialog({ title: R.title }).body.replaceChildren(el('p', { class: 'card-msg' }, R.loadFailed));
    return;
  }
  const { state, events } = data;
  const metrics = state ? computeMetrics(state, events) : null;
  const now = Date.now();
  const dialog = openDialog({ title: R.title });
  const msg = el('p', { class: 'card-msg', role: 'status', 'aria-live': 'polite' });

  const stateNote = !state ? el('p', { class: 'card-msg' }, data.stateError ? R.badState(data.stateError) : R.noState) : null;
  const exports = el('div', { class: 'rs-exports' },
    on(el('button', { type: 'button', class: 'secondary' }, R.exportCsv), 'click',
      () => download(exportFileName('events', 'csv'), eventsCsv(state, events), 'text/csv;charset=utf-8')),
    on(el('button', { type: 'button', class: 'secondary' }, R.exportJson), 'click',
      () => download(exportFileName('data', 'json'), exportJson(data.raw, state, events), 'application/json')));

  const metricList = metrics && metrics.commissions.length
    ? el('ul', { class: 'rs-metrics' }, ...metrics.commissions.map((m) => metricCard(m, now)))
    : el('p', { class: 'hint' }, R.noCommissions);

  const eventList = el('details', { class: 'rs-events' },
    el('summary', {}, R.eventsTitle(events.length)),
    el('ol', { reversed: true }, ...[...events].reverse().map((e) => eventRow(state, e))));

  // 清除全部資料：先換成確認的按鈕，再按一次才真的刪
  const clearBox = el('div', { class: 'rs-clear' });
  function showClear(): void {
    clearBox.replaceChildren(on(el('button', { type: 'button', class: 'danger' }, R.clear), 'click', showConfirm));
  }
  function showConfirm(): void {
    const yes = el('button', { type: 'button', class: 'danger' }, R.clearYes);
    on(yes, 'click', async () => {
      yes.disabled = true; yes.textContent = R.clearing;
      try {
        await deps.kv.clear();
        dialog.close();
        deps.onCleared();
      } catch (err) {
        console.error('清除失敗', err);
        msg.textContent = R.clearFailed;
        yes.disabled = false; yes.textContent = R.clearYes;
      }
    });
    const no = on(el('button', { type: 'button', class: 'secondary' }, R.clearNo), 'click', showClear);
    clearBox.replaceChildren(el('p', { class: 'rs-warn' }, R.clearConfirm), el('div', { class: 'form-actions' }, yes, no));
    // 焦點放在「先不要」：不小心按到 Enter 也不會刪掉
    no.focus();
  }
  showClear();

  dialog.body.replaceChildren(
    el('p', { class: 'card-note' }, R.note),
    ...(stateNote ? [stateNote] : []),
    summary(data, metrics),
    exports,
    el('p', { class: 'card-note' }, R.exportNote),
    el('h3', { class: 'section-title' }, R.metricsTitle),
    metricList,
    eventList,
    clearBox,
    msg,
  );
}
