// 進入點：組裝大廳、讀存檔；第一次進入先建立 OC，再把主角和公會成員放進大廳，接上委託板和任務計時。
import './style.css';
import * as THREE from 'three';
import type { Texture } from 'pixi.js';
import { createActions } from './core/actions';
import { logEvent } from './core/events';
import type { SpriteManifest } from './core/manifest';
import { pickGuildMembers, uploadedPhotoId, uploadSpriteRef } from './core/oc';
import { createGuildState, currentWork, findLevel, loadState, saveState } from './core/state';
import { getPhoto, idbKV, putPhoto, type KV } from './core/storage';
import { createGuildStore, type GuildStore } from './core/store';
import { elapsedMs, plannedMs, timerPhase } from './core/timer';
import type { GuildState, OCProfile } from './core/types';
import { createBoard } from './scene/board';
import { CameraRig } from './scene/camera';
import type { Chibi, ChibiWorld } from './scene/chibi';
import { Input } from './scene/input';
import { createLobby, MEMBER_LABEL, type Lobby } from './scene/lobby';
import { createPlaza } from './scene/plaza';
import { createRenderers } from './scene/renderer';
import { loadManifest, loadTexture, spriteUrl } from './scene/sprites';
import { createViewport } from './scene/viewport';
import { openBoard } from './ui/board';
import { openChangeLook } from './ui/changeLook';
import { COPY } from './ui/copy';
import { showCreateOcCard, type SpriteChoice } from './ui/createOC';
import { createHud } from './ui/hud';
import { openOcCard, type OcCardOptions } from './ui/ocCard';
import { openTimer } from './ui/timer';
import { createWakeLock } from './ui/wakeLock';

const ORIGIN = new THREE.Vector3();
const warn = (what: string) => (err: unknown): void => console.warn(what, err);

async function main(): Promise<void> {
  const kv = idbKV();
  // 先記開啟，3D 場景載入失敗也記得到；寫不進去不影響大廳
  logEvent(kv, 'app_opened').catch(warn('事件紀錄寫入失敗'));

  const stage = document.getElementById('stage');
  if (!stage) throw new Error('找不到 #stage');
  const vp = createViewport(stage);

  const gfx = await createRenderers(vp);
  const plaza = createPlaza();
  const board = createBoard(plaza.scene);
  const rig = new CameraRig(vp);
  const world: ChibiWorld = { scene: plaza.scene, layer: gfx.charLayer, rig, shadowGeo: plaza.shadowGeo, shadowTex: plaza.shadowTex };
  const lobby = createLobby(world, plaza);
  const hud = createHud({
    onHello: () => lobby.helloAll(),
    onToggleTime: () => plaza.toggleTime(),
  });

  /** 讀好存檔（或建立 OC）之後才有；之前大廳只有場景 */
  let guild: Guild | null = null;
  // 點擊：先看有沒有點到小人（小人畫在最前面），再看委託板，最後才是地板
  const input = new Input(vp, rig, (x, y) => {
    const hit = lobby.pickAt(x, y);
    if (hit) {
      // 做任務中點主角：回到計時畫面
      if (guild && hit === lobby.player && lobby.working) guild.openCurrentTask();
      else lobby.poke(hit);
      return;
    }
    if (guild && rig.hits(x, y, board.targets)) { guild.openBoard(); return; }
    lobby.walkTo(x, y);
  });

  addEventListener('resize', () => {
    gfx.resize();
    rig.frame();
  });

  // 大廳先動起來；第一次進入時，建立 OC 的卡片蓋在上面
  const clock = new THREE.Clock();
  let t = 0;
  function loop(): void {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    const player = lobby.player;
    if (input.updateKeys() && player && !lobby.working) player.manual = true;
    guild?.syncWork();

    plaza.update(dt, t, player ? player.pos : null);
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

  guild = startGuild({ kv, manifest, store: createGuildStore(kv, state), lobby, player, look });
  hud.onBoard(guild.openBoard);
  hud.onCard(guild.openCard);
  guild.syncWork(true);
  // 計時中重新整理：直接回到計時畫面（暫停中的就留在大廳，從委託板「回到任務」）
  guild.resumeIfRunning();
}

interface Guild {
  openBoard(): void;
  /** 玩家按 HUD 打開 OC 設定卡 */
  openCard(): void;
  /** 打開正在做的任務的計時畫面 */
  openCurrentTask(): void;
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
}

/** 存檔準備好之後：委託板、任務計時、OC 設定卡、換造型、主角做任務的樣子 */
function startGuild({ kv, manifest, store, lobby, player, look: initialLook }: GuildDeps): Guild {
  const actions = createActions(kv, store);
  const wakeLock = createWakeLock();
  let look = initialLook;

  const showCard = (opts: OcCardOptions = {}): void => openOcCard({
    store,
    ocImage: () => look.url,
    onChangeLook: () => openChangeLook({
      presets: manifest.members, spriteUrl, currentSprite: store.state.oc.sprite,
      save: changeLook,
      onClosed: () => showCard(),
    }),
  }, opts);

  /** 換造型：上傳的圖先存成照片，再改存檔、換掉大廳裡主角的圖 */
  async function changeLook(choice: SpriteChoice): Promise<void> {
    const sprite = choice.kind === 'preset' ? choice.file : uploadSpriteRef(await putPhoto(kv, choice.blob));
    if (!(await actions.changeOcSprite(sprite))) return;
    look = await loadPlayerLook(kv, manifest, sprite);
    player.setTexture(look.tex);
    player.hop();
  }

  const showTimer = (commissionId: string, levelId: string): void => openTimer({
    store, actions, wakeLock, commissionId, levelId,
    // 完成一個任務：OC 設定卡跳出來、那一片點亮；關掉設定卡時主角跳一下說話
    onCompleted: (commission, level) => showCard({
      highlight: { commissionId: commission.id, levelId: level.id },
      onClose: () => { player.hop(); player.say(COPY.speech.taskDone); },
    }),
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
    }),
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
    memberTexes.map((tex) => ({ def: { name: MEMBER_LABEL }, tex })),
  );
  return { player, look };
}

void main();
