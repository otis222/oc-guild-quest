import { describe, expect, it } from 'vitest';
import { createActions } from '../../src/core/actions';
import { loadEvents } from '../../src/core/events';
import { createGuildState, currentWork, findLevel, loadState, saveState, timedProgress } from '../../src/core/state';
import { getPhoto } from '../../src/core/storage';
import { createGuildStore } from '../../src/core/store';
import { templateLevels } from '../../src/core/templates';
import { remainingMs, timerPhase } from '../../src/core/timer';
import { memoryKV } from '../helpers/memoryKV';

const MIN = 60_000;

async function setup() {
  const kv = memoryKV();
  await saveState(kv, createGuildState({ name: '小鈴', sprite: 'maid_1.png' }, 0));
  const store = createGuildStore(kv, (await loadState(kv))!);
  const clock = { now: 1_000_000 };
  const actions = createActions(kv, store, () => clock.now);
  const draft = { course: 'color' as const, title: '色相環', dueAt: 9_000_000, levels: templateLevels('color') };
  const cId = await actions.createCommission(draft);
  const levelIds = store.state.commissions[0].levels.map((l) => l.id);
  const types = async (): Promise<string[]> => (await loadEvents(kv)).map((e) => e.type);
  return { kv, store, clock, actions, cId, levelIds, types, draft };
}

describe('委託與任務的操作', () => {
  it('接委託記 commission_created', async () => {
    const { types, store, cId } = await setup();
    expect(await types()).toEqual(['commission_created']);
    expect(store.state.commissions[0].id).toBe(cId);
  });

  it('委託單上新加課程：先記 course_created 再記 commission_created；同一門課再接不會再記', async () => {
    const { actions, store, kv, types, draft } = await setup();
    const id1 = await actions.createCommission({ ...draft, course: { label: '攝影', part: 'layout' } });
    const course = store.state.customCourses[0];
    expect(course).toMatchObject({ label: '攝影', part: 'layout' });
    expect(store.state.commissions.find((c) => c.id === id1)?.course).toBe(course.id);
    await actions.createCommission({ ...draft, course: course.id });
    expect(await types()).toEqual(['commission_created', 'course_created', 'commission_created', 'commission_created']);
    const events = await loadEvents(kv);
    expect(events[1].data).toEqual({ course: course.id, label: '攝影', part: 'layout' });
    expect(events[2]).toMatchObject({ commissionId: id1, data: { course: course.id } });
    expect((await loadState(kv))!.customCourses).toEqual([course]);
  });

  it('開始 → 暫停 → 繼續 → 完成：四種事件都有記，而且照順序', async () => {
    const { actions, cId, levelIds, clock, types, kv } = await setup();
    const l = levelIds[0];
    expect(await actions.startLevel(cId, l)).toBe(true);
    clock.now += 3 * MIN;
    expect(await actions.pauseLevel(cId, l)).toBe(true);
    clock.now += 2 * MIN;
    expect(await actions.resumeLevel(cId, l)).toBe(true);
    clock.now += 4 * MIN;
    expect(await actions.completeLevel(cId, l)).toBe(true);
    expect(await types()).toEqual(['commission_created', 'level_started', 'level_paused', 'level_resumed', 'level_completed']);
    const events = await loadEvents(kv);
    expect(events[3].data).toEqual({ pausedForMs: 2 * MIN });
    expect(events[4]).toMatchObject({ commissionId: cId, levelId: l, data: { focusMs: 7 * MIN, early: true } });
  });

  it('計時中重新整理：從存檔讀回來，剩餘時間照時間戳算', async () => {
    const { actions, cId, levelIds, clock, kv } = await setup();
    await actions.startLevel(cId, levelIds[0]);
    clock.now += 4 * MIN + 30_000;
    // 模擬重新整理：丟掉記憶體裡的狀態，從 IndexedDB 重新讀
    const reloaded = (await loadState(kv))!;
    const { level } = findLevel(reloaded, cId, levelIds[0]);
    expect(remainingMs(level, clock.now)).toBe(5 * MIN + 30_000);
    expect(timerPhase(level, clock.now)).toBe('running');
  });

  it('完成一關剛好點亮一片：連按兩次完成，只算一次、只記一筆', async () => {
    const { actions, cId, levelIds, store, types } = await setup();
    await actions.startLevel(cId, levelIds[0]);
    expect(await actions.completeLevel(cId, levelIds[0])).toBe(true);
    expect(await actions.completeLevel(cId, levelIds[0])).toBe(false);
    expect(timedProgress(store.state.commissions[0])).toEqual({ done: 1, total: 5 });
    expect((await types()).filter((t) => t === 'level_completed')).toHaveLength(1);
  });

  it('從小提示的「下一個任務」開始：level_started 記下 via', async () => {
    const { actions, cId, levelIds, kv } = await setup();
    await actions.startLevel(cId, levelIds[0], 'toast');
    expect((await loadEvents(kv)).at(-1)).toMatchObject({ type: 'level_started', data: { minutes: 10, via: 'toast' } });
  });

  it('時間到之後按再 5 分鐘：記 level_extended，標記是時間到之後', async () => {
    const { actions, cId, levelIds, clock, kv } = await setup();
    await actions.startLevel(cId, levelIds[0]);
    clock.now += 12 * MIN;
    expect(await actions.extendLevel(cId, levelIds[0])).toBe(true);
    const last = (await loadEvents(kv)).at(-1);
    expect(last).toMatchObject({ type: 'level_extended', data: { minutes: 5, afterTimeUp: true } });
  });

  it('時間到之後才完成：early 是 false，專注時間 10 分鐘', async () => {
    const { actions, cId, levelIds, clock, kv } = await setup();
    await actions.startLevel(cId, levelIds[0]);
    clock.now += 15 * MIN;
    await actions.completeLevel(cId, levelIds[0]);
    expect((await loadEvents(kv)).at(-1)?.data).toEqual({ focusMs: 10 * MIN, early: false });
  });

  it('同時只跑一個：開始另一張委託的任務，原本的會自動暫停並記一筆', async () => {
    const { actions, cId, levelIds, clock, store, kv, draft } = await setup();
    const other = await actions.createCommission({ ...draft, title: '另一份' });
    const otherLevel = store.state.commissions[1].levels[0].id;
    await actions.startLevel(cId, levelIds[0]);
    clock.now += MIN;
    await actions.startLevel(other, otherLevel);
    const s = store.state;
    expect(timerPhase(findLevel(s, cId, levelIds[0]).level, clock.now)).toBe('paused');
    expect(timerPhase(findLevel(s, other, otherLevel).level, clock.now)).toBe('running');
    expect(currentWork(s)?.level.id).toBe(otherLevel);
    const events = await loadEvents(kv);
    expect(events.slice(-2).map((e) => [e.type, e.levelId, e.data])).toEqual([
      ['level_paused', levelIds[0], { auto: true }],
      ['level_started', otherLevel, { minutes: 10 }],
    ]);
  });

  it('沒有變化的操作不記事件（例如還沒開始就按暫停）', async () => {
    const { actions, cId, levelIds, types } = await setup();
    expect(await actions.pauseLevel(cId, levelIds[0])).toBe(false);
    expect(await actions.resumeLevel(cId, levelIds[0])).toBe(false);
    expect(await types()).toEqual(['commission_created']);
  });

  it('換造型：存檔裡的圖換掉並記 oc_changed；換成一樣的不記', async () => {
    const { actions, store, kv } = await setup();
    expect(await actions.changeOcSprite('upload:abc')).toBe(true);
    expect(store.state.oc.sprite).toBe('upload:abc');
    expect((await loadEvents(kv)).at(-1)).toMatchObject({ type: 'oc_changed', data: { from: 'maid_1.png', to: 'upload:abc' } });
    expect(await actions.changeOcSprite('upload:abc')).toBe(false);
    expect((await loadEvents(kv)).filter((e) => e.type === 'oc_changed')).toHaveLength(1);
  });

  it('打開設定卡記 oc_card_opened', async () => {
    const { actions, kv } = await setup();
    await actions.noteOcCardOpened('hud');
    expect((await loadEvents(kv)).at(-1)).toMatchObject({ type: 'oc_card_opened', data: { via: 'hud' } });
  });

  it('交件關不能用計時操作', async () => {
    const { actions, cId, levelIds } = await setup();
    await expect(actions.startLevel(cId, levelIds[5])).rejects.toThrow();
  });
});

describe('加分關（設定圖急救）', () => {
  const result = (score: number) => ({ score, passed: ['feet', 'text'], ms: 42_000, moves: 9 });

  it('開始記 bonus_started；計分記 bonus_finished，存下最高分', async () => {
    const { actions, cId, store, kv, clock } = await setup();
    await actions.startBonus(cId);
    expect(await actions.finishBonus(cId, result(65))).toBe(65);
    expect(store.state.commissions[0].bonusBest).toBe(65);
    expect((await loadState(kv))!.commissions[0].bonusBest).toBe(65);
    const events = (await loadEvents(kv)).slice(-2);
    expect(events[0]).toEqual({ t: clock.now, type: 'bonus_started', commissionId: cId });
    expect(events[1]).toEqual({
      t: clock.now, type: 'bonus_finished', commissionId: cId,
      data: { score: 65, best: 65, passed: ['feet', 'text'], ms: 42_000, moves: 9 },
    });
  });

  it('第二次比較低：最高分不變，事件照記這次的分數', async () => {
    const { actions, cId, store, kv } = await setup();
    await actions.finishBonus(cId, result(85));
    expect(await actions.finishBonus(cId, result(50))).toBe(85);
    expect(store.state.commissions[0].bonusBest).toBe(85);
    expect((await loadEvents(kv)).at(-1)?.data).toMatchObject({ score: 50, best: 85 });
  });

  it('改台詞：存進 OC，不記事件；一樣的不算有變', async () => {
    const { actions, store, kv, types } = await setup();
    expect(await actions.setOcQuote('今天也要畫圖')).toBe(true);
    expect(store.state.oc.quote).toBe('今天也要畫圖');
    expect((await loadState(kv))!.oc.quote).toBe('今天也要畫圖');
    expect(await actions.setOcQuote(' 今天也要畫圖 ')).toBe(false);
    expect(await types()).toEqual(['commission_created']);
  });
});

describe('交件與展品', () => {
  const jpeg = (text: string): Blob => new Blob([text], { type: 'image/jpeg' });
  const photoKeys = (kv: { raw: Map<string, unknown> }): string[] => [...kv.raw.keys()].filter((k) => k.startsWith('photo:'));

  it('交件：照片存進 IndexedDB，委託交件、OC 換配色、展台放上照片、公會等級 2，記 photo_added 和 commission_submitted', async () => {
    const { actions, cId, store, kv, clock } = await setup();
    expect(await actions.submitCommission(cId, { photo: jpeg('photo'), palette: ['#e5484d'] })).toBe(true);
    const s = (await loadState(kv))!;
    const c = s.commissions[0];
    expect(c.submittedAt).toBe(clock.now);
    expect(await (await getPhoto(kv, c.photoId!))?.text()).toBe('photo');
    expect(s.oc.palette).toEqual(['#e5484d']);
    expect(s.exhibits).toEqual([c.photoId]);
    expect(s.guildLevel).toBe(2);
    expect(store.state).toEqual(s);
    const events = (await loadEvents(kv)).slice(-2);
    expect(events.map((e) => e.type)).toEqual(['photo_added', 'commission_submitted']);
    expect(events[0]).toMatchObject({ commissionId: cId, data: { photoId: c.photoId, bytes: 5 } });
    expect(events[1]).toMatchObject({
      commissionId: cId, data: { photoId: c.photoId, part: 'palette', beforeDueMs: 9_000_000 - clock.now, guildLevel: 2 },
    });
  });

  it('名牌：裁好的名牌圖另外存一張', async () => {
    const { actions, store, kv, draft } = await setup();
    const id = await actions.createCommission({ ...draft, course: 'typography' });
    await actions.submitCommission(id, { photo: jpeg('photo'), nameplate: jpeg('plate') });
    const c = store.state.commissions.find((x) => x.id === id)!;
    expect(await (await getPhoto(kv, c.nameplatePhotoId!))?.text()).toBe('plate');
    expect(store.state.oc.nameplatePhotoId).toBe(c.nameplatePhotoId);
  });

  it('已經交過了：回傳 false，剛存的照片刪掉，事件不重記', async () => {
    const { actions, cId, kv, types } = await setup();
    await actions.submitCommission(cId, { photo: jpeg('a'), palette: ['#e5484d'] });
    const before = photoKeys(kv);
    expect(await actions.submitCommission(cId, { photo: jpeg('b'), palette: ['#2bb3a3'] })).toBe(false);
    expect(photoKeys(kv)).toEqual(before);
    expect((await types()).filter((t) => t === 'commission_submitted')).toHaveLength(1);
  });

  it('存檔失敗（例如配色沒有顏色）：丟錯，剛存的照片也刪掉', async () => {
    const { actions, cId, kv, store } = await setup();
    await expect(actions.submitCommission(cId, { photo: jpeg('a') })).rejects.toThrow();
    expect(photoKeys(kv)).toEqual([]);
    expect(store.state.commissions[0].submittedAt).toBeUndefined();
  });

  it('點展品記 exhibit_opened，帶著是哪張委託', async () => {
    const { actions, cId, store, kv } = await setup();
    await actions.submitCommission(cId, { photo: jpeg('a'), palette: ['#e5484d'] });
    await actions.noteExhibitOpened(0, store.state.exhibits[0]);
    expect((await loadEvents(kv)).at(-1)).toMatchObject({ type: 'exhibit_opened', commissionId: cId, data: { slot: 0 } });
  });
});
