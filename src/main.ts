// 進入點：組裝大廳、讀存檔；第一次進入先建立 OC，再把主角和公會成員放進大廳。
import './style.css';
import * as THREE from 'three';
import type { Texture } from 'pixi.js';
import { logEvent } from './core/events';
import { newId } from './core/id';
import type { SpriteManifest } from './core/manifest';
import { pickGuildMembers, uploadedPhotoId, uploadSpriteRef } from './core/oc';
import { addCommission, createGuildState, loadState, saveState, type CommissionDraft } from './core/state';
import { getPhoto, idbKV, putPhoto, type KV } from './core/storage';
import { createGuildStore, type GuildStore } from './core/store';
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
import { COPY } from './ui/copy';
import { showCreateOcCard } from './ui/createOC';
import { createHud } from './ui/hud';

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
  /** 建立 OC、讀好存檔之後才能打開委託板 */
  let showBoard: (() => void) | null = null;
  // 點擊：先看有沒有點到小人（小人畫在最前面），再看委託板，最後才是地板
  const input = new Input(vp, rig, (x, y) => {
    if (lobby.pokeAt(x, y)) return;
    if (showBoard && rig.hits(x, y, board.targets)) { showBoard(); return; }
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
    if (input.updateKeys() && player) player.manual = true;

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
  const player = await spawnCharacters(lobby, kv, manifest, state.oc);
  hud.hideLoading();
  if (isNew) player.hop();

  const store = createGuildStore(kv, state);
  const open = (): void => openBoard({ store, createCommission: (draft) => createCommission(kv, store, draft) });
  showBoard = open;
  hud.onBoard(open);
}

/** 接新委託：存檔＋記 commission_created */
async function createCommission(kv: KV, store: GuildStore, draft: CommissionDraft): Promise<void> {
  const id = newId();
  await store.update((s) => addCommission(s, draft, Date.now(), id));
  await logEvent(kv, 'commission_created', {
    commissionId: id, data: { course: draft.course, levels: draft.levels.length, dueAt: draft.dueAt },
  }).catch(warn('事件紀錄寫入失敗'));
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

/** 主角的圖：AI 小人用檔名讀，上傳的圖從 IndexedDB 讀 */
async function loadPlayerTexture(kv: KV, sprite: string): Promise<Texture> {
  const photoId = uploadedPhotoId(sprite);
  if (!photoId) return loadTexture(spriteUrl(sprite));
  const blob = await getPhoto(kv, photoId);
  if (!blob) throw new Error(`找不到上傳的圖 ${photoId}`);
  // 主角圖整場都會用到，網址不收回
  return loadTexture(URL.createObjectURL(blob));
}

/** 放主角和公會成員進大廳；哪張圖載入失敗就用剪影代替 */
async function spawnCharacters(lobby: Lobby, kv: KV, manifest: SpriteManifest, oc: OCProfile): Promise<Chibi> {
  let silhouette: Promise<Texture> | null = null;
  const fallback = (err: unknown): Promise<Texture> => {
    console.warn('小人圖載入失敗，改用剪影', err);
    return (silhouette ??= loadTexture(spriteUrl(manifest.playerDefault)));
  };
  const members = pickGuildMembers(manifest.members, oc.sprite);
  const [playerTex, ...memberTexes] = await Promise.all([
    loadPlayerTexture(kv, oc.sprite).catch(fallback),
    ...members.map((m) => loadTexture(spriteUrl(m.file)).catch(fallback)),
  ]);
  return lobby.populate(
    { def: { name: oc.name }, tex: playerTex },
    memberTexes.map((tex) => ({ def: { name: MEMBER_LABEL }, tex })),
  );
}

void main();
