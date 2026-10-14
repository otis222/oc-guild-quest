// 大廳裡的角色：一隻主角（玩家的 OC，固定被選取、鏡頭跟著）＋公會成員（自己閒逛、打招呼，不能操控）。
// 任務計時中，主角走到委託板前停下、頭上顯示進度環，不會自己亂走，點地板和 WASD 也不會動。
// 交件後公會成員會圍到新展品前面（T14）：走過去、跳一下說一句話，過一會兒回去閒逛。
import type { Texture } from 'pixi.js';
import { Vector3 } from 'three';
import { pick, rand } from '../core/math';
import { BOARD_WORK_SPOT } from './board';
import { Chibi, HELLO, POKED, type ChibiDef, type ChibiWorld, type RingValue } from './chibi';
import { FOUNTAIN_R, WALK_R } from './constants';
import type { Plaza } from './plaza';

/** 公會成員頭上顯示的名字 */
export const MEMBER_LABEL = '公會成員';
/** 主角進大廳的位置：噴水池前面、靠鏡頭這一側，一進來就在畫面中間 */
const PLAYER_SPAWN = { x: 0, z: 4.2 };
const NO_KEYS = new Vector3();
/**
 * 圍觀（T14）：站在離廣場中心多遠（可走範圍內、展台前面），左右各站在哪裡。
 * 正前方留空：小人一定畫在 3D 物件前面，站在展台正前方會把相框擋住。
 */
const GATHER_R = 6.9;
const GATHER_SPOTS = [-2.2, -1.3, 1.3, 2.2];

/** 正在圍觀的公會成員 */
interface Gatherer {
  chibi: Chibi;
  line: string;
  /** 走到了、說過話了 */
  said: boolean;
  /** 什麼時候回去閒逛（大廳時間，秒） */
  until: number;
}

export interface CharacterSpec {
  def: ChibiDef;
  tex: Texture;
  /** 用的是哪張圖（公會成員用 manifest 檔名，換造型時拿來重新分配） */
  key?: string;
}

export interface Lobby {
  /** 主角；還沒建立 OC 之前是 null */
  readonly player: Chibi | null;
  /** 主角是不是正在做任務（站在委託板前） */
  readonly working: boolean;
  /** 放進主角和公會成員（只呼叫一次），回傳主角 */
  populate(player: CharacterSpec, members: readonly CharacterSpec[]): Chibi;
  /** 點到哪隻小人（最前面那隻）；沒點到回傳 null */
  pickAt(x: number, y: number): Chibi | null;
  /** 小人被點到：跳一下說一句話（line 沒給就隨機挑一句） */
  poke(c: Chibi, line?: string): void;
  /** 主角走到點的地板位置（點到廣場外面、或正在做任務就不動） */
  walkTo(x: number, y: number): void;
  /**
   * 每幀呼叫：正在做任務就傳進度（進度環），沒有就傳 null。
   * 剛開始做任務時主角會走到委託板前；instant 為 true 時直接站過去（重新整理後用）。
   */
  setWork(work: RingValue | null, instant?: boolean): void;
  /** 每位公會成員目前用的圖（照位置） */
  memberKeys(): string[];
  /** 換掉第 i 位公會成員的圖 */
  setMemberLook(index: number, key: string, tex: Texture): void;
  /**
   * 公會成員圍到 at（展台）前面（T14）：離得最近的幾位走過去，到了跳一下、說 lines 裡的一句，
   * seconds 秒後回去閒逛。圍觀時不會自己閒逛、也不會互相打招呼；點他們照樣會跳。
   */
  gather(at: Vector3, lines: readonly string[], seconds: number): void;
  helloAll(): void;
  update(dt: number, t: number, keyDir: Vector3): void;
}

export function createLobby(world: ChibiWorld, plaza: Plaza): Lobby {
  let player: Chibi | null = null;
  let all: Chibi[] = [];
  let membersList: Chibi[] = [];
  let keys: string[] = [];
  let working = false;
  let gatherers: Gatherer[] = [];
  /** 最近一次 update 的時間（秒），圍觀的倒數用 */
  let now = 0;

  return {
    get player() { return player; },
    get working() { return working; },

    populate(p, members) {
      if (player) throw new Error('大廳已經有主角了');
      const total = members.length + 1;
      const me = new Chibi(world, p.def, p.tex, 0, total);
      me.pos.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
      membersList = members.map((m, i) => new Chibi(world, m.def, m.tex, i + 1, total));
      keys = members.map((m) => m.key ?? '');
      all = [me, ...membersList];
      player = me;
      return me;
    },

    memberKeys: () => [...keys],

    setMemberLook(index, key, tex) {
      const m = membersList[index];
      if (!m) return;
      m.setTexture(tex);
      keys[index] = key;
    },

    pickAt(x, y) {
      const hits = all.filter((c) => c.hit(x, y)).sort((a, b) => b.view.zIndex - a.view.zIndex);
      return hits[0] ?? null;
    },

    poke(c, line) {
      c.hop(); c.say(line ?? pick(POKED));
    },

    walkTo(x, y) {
      if (!player || working) return;
      const p = world.rig.floorPoint(x, y);
      if (!p) return;
      const r = Math.hypot(p.x, p.z);
      if (r > 9.4) return;
      if (r > WALK_R) { p.x *= WALK_R / r; p.z *= WALK_R / r; }
      if (r < FOUNTAIN_R + 0.2) { const k = (FOUNTAIN_R + 0.3) / (r || 1); p.x *= k; p.z *= k; }
      player.manual = true; player.goTo(p.x, p.z);
      plaza.showMarker(p.x, p.z);
    },

    setWork(work, instant = false) {
      if (!player) return;
      if (work && !working) {
        working = true;
        player.manual = true;
        if (instant) { player.pos.set(BOARD_WORK_SPOT.x, 0, BOARD_WORK_SPOT.z); player.target = null; player.state = 'idle'; }
        else player.goTo(BOARD_WORK_SPOT.x, BOARD_WORK_SPOT.z);
      } else if (!work && working) {
        working = false;
      }
      player.setRing(work);
    },

    gather(at, lines, seconds) {
      const a = Math.atan2(at.z, at.x);
      const center = new Vector3(Math.cos(a) * GATHER_R, 0, Math.sin(a) * GATHER_R);
      const tangent = new Vector3(-Math.sin(a), 0, Math.cos(a));
      // 離展台最近的幾位；照他們現在左右的位置排，走過去時才不會交叉
      const picked = [...membersList]
        .sort((p, q) => p.pos.distanceTo(center) - q.pos.distanceTo(center))
        .slice(0, GATHER_SPOTS.length)
        .sort((p, q) => p.pos.dot(tangent) - q.pos.dot(tangent));
      const words = [...lines].sort(() => Math.random() - 0.5);
      const kept = gatherers.filter((g) => !picked.includes(g.chibi));
      gatherers = [...kept, ...picked.map((chibi, i): Gatherer => {
        const offset = GATHER_SPOTS[i] ?? 0;
        const spot = center.clone().addScaledVector(tangent, offset);
        chibi.manual = true;
        chibi.goTo(spot.x, spot.z);
        return { chibi, line: words[i % words.length] ?? '', said: false, until: now + seconds };
      })];
    },

    helloAll() {
      all.forEach((c, i) => setTimeout(() => { c.hop(); c.say(pick(HELLO)); }, i * 110));
    },

    update(dt, t, keyDir) {
      if (!player) return;
      now = t;
      // 圍觀：走到了跳一下說一句；時間到了回去閒逛
      for (const g of gatherers) {
        if (!g.said && g.chibi.target === null && g.chibi.state === 'idle') {
          g.said = true;
          g.chibi.hop();
          if (g.line) g.chibi.say(g.line);
        }
        if (t >= g.until) { g.chibi.manual = false; g.chibi.timer = rand(0.5, 2); }
      }
      gatherers = gatherers.filter((g) => t < g.until);
      const ctl = { selected: player, keyDir: working ? NO_KEYS : keyDir };
      for (const c of all) c.update(dt, t, all, ctl);
    },
  };
}
