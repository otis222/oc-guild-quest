// 進入點：組裝大廳、讀存檔；第一次進入先建立 OC，再把主角和公會成員放進大廳，
// 接上委託板、任務計時、OC 設定卡、交件和展品。
import './style.css';
import * as THREE from 'three';
import type { Texture } from 'pixi.js';
import { createActions } from './core/actions';
import { courseInfo } from './core/courses';
import { logEvent } from './core/events';
import type { SpriteManifest } from './core/manifest';
import { cellOf, monthDay } from './core/ocCard';
import { pickGuildMembers, reassignMembers, uploadedPhotoId, uploadSpriteRef } from './core/oc';
import { createGuildState, currentWork, findCommission, findLevel, loadState, saveState } from './core/state';
import { createFpsGuard } from './core/fpsGuard';
import { deletePhoto, getPhoto, idbKV, putPhoto, requestPersistence, type KV } from './core/storage';
import { createGuildStore, type GuildStore } from './core/store';
import { commissionOfPhoto } from './core/submit';
import { elapsedMs, plannedMs, timerPhase } from './core/timer';
import type { Commission, GuildState, OCProfile } from './core/types';
import { createBoard } from './scene/board';
import { CameraRig } from './scene/camera';
import type { Chibi, ChibiWorld } from './scene/chibi';
import { createExhibits, type Exhibits } from './scene/exhibits';
import { Input } from './scene/input';
import { createLobby, MEMBER_LABEL, type Lobby } from './scene/lobby';
import { createPlaza, type Plaza } from './scene/plaza';
import { createRenderers, supportsWebGL2, type Renderers } from './scene/renderer';
import { createShowcase } from './scene/showcase';
import { loadManifest, loadTexture, spriteUrl } from './scene/sprites';
import { createViewport } from './scene/viewport';
import { openBoard } from './ui/board';
import { openChangeLook } from './ui/changeLook';
import { COPY } from './ui/copy';
import { showCreateOcCard, type SpriteChoice } from './ui/createOC';
import { createHud, showLoadingMessage } from './ui/hud';
import { openOcCard, type OcCardOptions } from './ui/ocCard';
import { openPhotoViewer } from './ui/photoViewer';
import { createPhotoUrls } from './ui/photos';
import { pieResult } from './ui/pie';
import { openSubmit } from './ui/submit';
import { openTimer } from './ui/timer';
import { showCardToast } from './ui/toast';
import { createWakeLock } from './ui/wakeLock';

const ORIGIN = new THREE.Vector3();
const warn = (what: string) => (err: unknown): void => console.warn(what, err);

async function main(): Promise<void> {
  const kv = idbKV();
  // 先記開啟，3D 場景載入失敗也記得到；寫不進去不影響大廳
  logEvent(kv, 'app_opened').catch(warn('事件紀錄寫入失敗'));

  const stage = document.getElementById('stage');
  if (!stage) throw new Error('找不到 #stage');
  // 不支援 WebGL2 的瀏覽器：顯示一句說明，不要白畫面（企劃表 T8）
  if (!supportsWebGL2()) { showLoadingMessage(COPY.noWebGL); return; }
  const vp = createViewport(stage);

  let gfx: Renderers;
  try {
    gfx = await createRenderers(vp);
  } catch (err) {
    console.error('WebGL 建立失敗', err);
    showLoadingMessage(COPY.noWebGL);
    return;
  }
  const plaza = createPlaza();
  const board = createBoard(plaza.scene);
  const exhibits = createExhibits(plaza.pedestals);
  const rig = new CameraRig(vp);
  const world: ChibiWorld = { scene: plaza.scene, layer: gfx.charLayer, rig, shadowGeo: plaza.shadowGeo, shadowTex: plaza.shadowTex };
  const lobby = createLobby(world, plaza);
  const hud = createHud({
    onHello: () => lobby.helloAll(),
    onToggleTime: () => plaza.toggleTime(),
  });

  /** 讀好存檔（或建立 OC）之後才有；之前大廳只有場景 */
  let guild: Guild | null = null;
  // 點擊：先看有沒有點到小人（小人畫在最前面），再看委託板、展品，最後才是地板
  const input = new Input(vp, rig, (x, y) => {
    const hit = lobby.pickAt(x, y);
    if (hit) {
      // 做任務中點主角：回到計時畫面
      if (guild && hit === lobby.player && lobby.working) guild.openCurrentTask();
      else lobby.poke(hit);
      return;
    }
    if (guild && rig.hits(x, y, board.targets)) { guild.openBoard(); return; }
    const slot = guild ? exhibits.slotAt(rig, x, y) : null;
    if (guild && slot !== null) { guild.openExhibit(slot); return; }
    lobby.walkTo(x, y);
  });

  addEventListener('resize', () => {
    gfx.resize();
    rig.frame();
  });

  // 大廳先動起來；第一次進入時，建立 OC 的卡片蓋在上面
  const clock = new THREE.Clock();
  // FPS 連續 3 秒低於 40：關陰影、像素比降到 1（企劃表 T8，不做畫質設定頁）
  const fpsGuard = createFpsGuard();
  let t = 0;
  function loop(): void {
    const elapsed = clock.getDelta();
    const dt = Math.min(0.05, elapsed);
    t += dt;
    if (fpsGuard.tick(elapsed)) {
      gfx.lowerQuality();
      plaza.setShadows(false);
      console.info('FPS 偏低，自動降低畫質（關陰影、像素比 1）');
    }
    const player = lobby.player;
    if (input.updateKeys() && player && !lobby.working) player.manual = true;
    guild?.syncWork();

    plaza.update(dt, t, player ? player.pos : null);
    exhibits.update(t);
    rig.update(dt, t, player ? player.pos : ORIGIN);
    lobby.update(dt, t, input.keyDir);

    gfx.render(plaza.scene, rig.camera);
    requestAnimationFrame(loop);
  }
  loop();

  const manifest = await loadManifest();
  let state: GuildState | null;
  try {
    state = await loadState(kv);
  } catch (err) {
    // 存檔讀不出來時不能讓玩家重建 OC，不然會把舊存檔蓋掉
    console.error('讀不到存檔', err);
    hud.showError(COPY.loadError);
    return;
  }

  const isNew = !state;
  if (!state) {
    hud.hideLoading();
    state = await createOc(kv, manifest);
  }
  const { player, look } = await spawnCharacters(lobby, kv, manifest, state.oc);
  hud.hideLoading();
  if (isNew) player.hop();

  guild = startGuild({ kv, manifest, store: createGuildStore(kv, state), lobby, player, look, plaza, exhibits });
  hud.onBoard(guild.openBoard);
  hud.onCard(guild.openCard);
  guild.syncWork(true);
  // 計時中重新整理：直接回到計時畫面（暫停中的就留在大廳，從委託板「回到任務」）
  guild.resumeIfRunning();
  // 有存檔以後，請瀏覽器不要自動清掉資料（Playtest 要玩一週）
  requestPersistence().then((ok) => console.info(ok ? '瀏覽器答應保留資料' : '瀏覽器沒有答應保留資料（資料照樣存著）'))
    .catch(warn('請求保留資料失敗'));
}

interface Guild {
  openBoard(): void;
  /** 玩家按 HUD 打開 OC 設定卡 */
  openCard(): void;
  /** 打開正在做的任務的計時畫面 */
  openCurrentTask(): void;
  /** 點大廳第 slot 座展台的展品：放大看 */
  openExhibit(slot: number): void;
  /** 每幀：主角要不要站在委託板前、頭上的進度環。instant：直接站過去（剛載入時） */
  syncWork(instant?: boolean): void;
  /** 有任務正在跑（或時間到）就打開計時畫面 */
  resumeIfRunning(): void;
}

/** 主角目前的造型：大廳用的貼圖、設定卡用的圖片網址 */
interface Look {
  tex: Texture;
  url: string;
}

interface GuildDeps {
  kv: KV;
  manifest: SpriteManifest;
  store: GuildStore;
  lobby: Lobby;
  player: Chibi;
  look: Look;
  plaza: Plaza;
  exhibits: Exhibits;
}

/** 存檔準備好之後：委託板、任務計時、OC 設定卡、換造型、交件、展品、主角做任務的樣子 */
function startGuild({ kv, manifest, store, lobby, player, look: initialLook, plaza, exhibits }: GuildDeps): Guild {
  const actions = createActions(kv, store);
  const wakeLock = createWakeLock();
  const photos = createPhotoUrls(kv);
  let look = initialLook;

  // 招牌的公會等級、主角光圈、頭上的名牌、展台上的展品跟著存檔變
  const syncShowcase = createShowcase({ plaza, exhibits, player, photoUrl: photos.get, levelLabel: COPY.hud.guildLevel });
  store.subscribe(syncShowcase);
  syncShowcase(store.state);

  const showCard = (opts: OcCardOptions = {}): void => openOcCard({
    store, photos,
    ocImage: () => look.url,
    onChangeLook: () => openChangeLook({
      presets: manifest.members, spriteUrl, currentSprite: store.state.oc.sprite,
      save: changeLook,
      onClosed: () => showCard(),
    }),
    // 從設定卡放大看作業，關掉後回到設定卡
    onViewWork: (c) => viewWork(c, COPY.viewer.work, () => showCard()),
  }, opts);

  /** 放大看一張委託交的作業照片 */
  function viewWork(c: Commission, title: string, onClose?: () => void): void {
    const photoId = c.photoId;
    if (!photoId) return;
    photos.get(photoId).then((url) => {
      if (!url) return;
      openPhotoViewer({
        url, title, alt: COPY.submit.photoAlt(c.title), onClose,
        caption: COPY.viewer.caption(courseInfo(store.state, c.course).label, c.title, monthDay(c.submittedAt ?? Date.now())),
      });
    }).catch(warn('照片讀取失敗'));
  }

  /** 交件畫面；交成功後主角跳一下說「交件了！」，大廳浮出小提示 */
  const showSubmit = (commissionId: string): void => openSubmit({
    store, commissionId,
    async submit(input) {
      const ok = await actions.submitCommission(commissionId, input);
      if (ok) {
        // 剛存的照片直接用手上的檔案顯示，不用再從 IndexedDB 讀
        const c = findCommission(store.state, commissionId);
        if (c.photoId) photos.remember(c.photoId, input.photo);
        if (c.nameplatePhotoId && input.nameplate) photos.remember(c.nameplatePhotoId, input.nameplate);
      }
      return ok;
    },
    onSubmitted: () => {
      player.hop();
      player.say(COPY.speech.submitted);
      const s = store.state, c = findCommission(s, commissionId), course = courseInfo(s, c.course);
      showCardToast({
        cell: cellOf(c), course, title: COPY.toast.submitted, detail: COPY.toast.submittedDetail(c.title, s.guildLevel),
        result: pieResult(c, course.part, photos.now),
        onOpen: () => {
          void actions.noteOcCardOpened('toast');
          showCard({ highlight: { commissionId } });
        },
      });
    },
  });

  /** 換造型：上傳的圖先存成照片，再改存檔、換掉大廳裡主角的圖；舊的上傳圖刪掉，公會成員重新分配 */
  async function changeLook(choice: SpriteChoice): Promise<void> {
    const oldSprite = store.state.oc.sprite;
    const sprite = choice.kind === 'preset' ? choice.file : uploadSpriteRef(await putPhoto(kv, choice.blob));
    if (!(await actions.changeOcSprite(sprite))) return;
    const oldUrl = look.url;
    look = await loadPlayerLook(kv, manifest, sprite);
    player.setTexture(look.tex);
    player.hop();
    await refreshMembers(sprite);
    // 舊的上傳圖已經用不到了：從 IndexedDB 刪掉，網址也收回
    const oldPhoto = uploadedPhotoId(oldSprite);
    if (oldPhoto && oldSprite !== sprite) {
      await deletePhoto(kv, oldPhoto).catch(warn('刪除舊的上傳圖失敗'));
      if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    }
  }

  /** 公會成員排除主角的新造型：只換掉不該出現的那位，其他人不動 */
  async function refreshMembers(sprite: string): Promise<void> {
    const current = lobby.memberKeys();
    const next = reassignMembers(current, pickGuildMembers(manifest.members, sprite).map((m) => m.file));
    await Promise.all(next.map(async (file, i) => {
      if (file === current[i]) return;
      const tex = await loadTexture(spriteUrl(file)).catch(() => loadTexture(spriteUrl(manifest.playerDefault)));
      lobby.setMemberLook(i, file, tex);
    }));
  }

  const showTimer = (commissionId: string, levelId: string): void => openTimer({
    store, actions, wakeLock, commissionId, levelId,
    // 完成一個任務：主角跳一下說話，大廳下面浮出小提示（迷你設定格點亮那一片），按了才打開 OC 設定卡
    onCompleted: (commission, level) => {
      player.hop();
      player.say(COPY.speech.taskDone);
      const course = courseInfo(store.state, commission.course), cell = cellOf(commission);
      showCardToast({
        cell, course, levelId: level.id,
        title: COPY.toast.lit, detail: COPY.toast.detail(course.label, commission.title, cell.lit, cell.slices.length),
        onOpen: () => {
          void actions.noteOcCardOpened('toast');
          showCard({ highlight: { commissionId: commission.id, levelId: level.id } });
        },
      });
    },
  });

  /** 開始任務（還沒開始的話）並打開計時畫面 */
  async function openTask(commissionId: string, levelId: string): Promise<void> {
    if (findLevel(store.state, commissionId, levelId).level.status === 'todo') await actions.startLevel(commissionId, levelId);
    showTimer(commissionId, levelId);
  }

  return {
    openBoard: () => openBoard({
      store,
      createCommission: (draft) => actions.createCommission(draft),
      openTask: (cId, lId) => { openTask(cId, lId).catch((err: unknown) => console.error('開始任務失敗', err)); },
      openSubmit: showSubmit,
    }),
    openExhibit(slot) {
      const photoId = store.state.exhibits[slot];
      if (!photoId) return;
      void actions.noteExhibitOpened(slot, photoId);
      const c = commissionOfPhoto(store.state, photoId);
      if (c) viewWork(c, COPY.viewer.exhibit);
    },
    openCard() {
      void actions.noteOcCardOpened('hud');
      showCard();
    },
    openCurrentTask() {
      const work = currentWork(store.state);
      if (work) showTimer(work.commission.id, work.level.id);
    },
    syncWork(instant = false) {
      const work = currentWork(store.state);
      if (!work) { lobby.setWork(null); return; }
      const now = Date.now();
      lobby.setWork({
        fraction: Math.min(1, elapsedMs(work.level, now) / plannedMs(work.level)),
        dim: timerPhase(work.level, now) === 'paused',
      }, instant);
    },
    resumeIfRunning() {
      const work = currentWork(store.state);
      if (work && timerPhase(work.level, Date.now()) !== 'paused') showTimer(work.commission.id, work.level.id);
    },
  };
}

/** 第一次進入：顯示建立 OC 的卡片，存好新存檔才回傳 */
function createOc(kv: KV, manifest: SpriteManifest): Promise<GuildState> {
  return showCreateOcCard({
    presets: manifest.members,
    spriteUrl,
    async onSubmit({ name, choice }) {
      const sprite = choice.kind === 'preset' ? choice.file : uploadSpriteRef(await putPhoto(kv, choice.blob));
      const state = createGuildState({ name, sprite });
      await saveState(kv, state);
      await logEvent(kv, 'oc_created', { data: { sprite } }).catch(warn('事件紀錄寫入失敗'));
      return state;
    },
  });
}

/** 主角的圖：AI 小人用檔名讀，上傳的圖從 IndexedDB 讀；載入失敗就用剪影 */
async function loadPlayerLook(kv: KV, manifest: SpriteManifest, sprite: string): Promise<Look> {
  try {
    const photoId = uploadedPhotoId(sprite);
    let url = spriteUrl(sprite);
    if (photoId) {
      const blob = await getPhoto(kv, photoId);
      if (!blob) throw new Error(`找不到上傳的圖 ${photoId}`);
      // 主角圖整場都會用到（大廳和設定卡），網址不收回
      url = URL.createObjectURL(blob);
    }
    return { tex: await loadTexture(url), url };
  } catch (err) {
    console.warn('主角圖載入失敗，改用剪影', err);
    const url = spriteUrl(manifest.playerDefault);
    return { tex: await loadTexture(url), url };
  }
}

/** 放主角和公會成員進大廳；哪張圖載入失敗就用剪影代替 */
async function spawnCharacters(lobby: Lobby, kv: KV, manifest: SpriteManifest, oc: OCProfile): Promise<{ player: Chibi; look: Look }> {
  let silhouette: Promise<Texture> | null = null;
  const fallback = (err: unknown): Promise<Texture> => {
    console.warn('小人圖載入失敗，改用剪影', err);
    return (silhouette ??= loadTexture(spriteUrl(manifest.playerDefault)));
  };
  const members = pickGuildMembers(manifest.members, oc.sprite);
  const [look, memberTexes] = await Promise.all([
    loadPlayerLook(kv, manifest, oc.sprite),
    Promise.all(members.map((m) => loadTexture(spriteUrl(m.file)).catch(fallback))),
  ]);
  const player = lobby.populate(
    { def: { name: oc.name }, tex: look.tex },
    memberTexes.map((tex, i) => ({ def: { name: MEMBER_LABEL }, tex, key: members[i].file })),
  );
  return { player, look };
}

main().catch((err: unknown) => {
  console.error('啟動失敗', err);
  showLoadingMessage(COPY.startFailed);
});
