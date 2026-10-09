// 大廳裡的角色：一隻主角（玩家的 OC，固定被選取、鏡頭跟著）＋公會成員（自己閒逛、打招呼，不能操控）。
// 任務計時中，主角走到委託板前停下、頭上顯示進度環，不會自己亂走，點地板和 WASD 也不會動。
import type { Texture } from 'pixi.js';
import { Vector3 } from 'three';
import { pick } from '../core/math';
import { BOARD_WORK_SPOT } from './board';
import { Chibi, HELLO, POKED, type ChibiDef, type ChibiWorld, type RingValue } from './chibi';
import { FOUNTAIN_R, WALK_R } from './constants';
import type { Plaza } from './plaza';

/** 公會成員頭上顯示的名字 */
export const MEMBER_LABEL = '公會成員';
/** 主角進大廳的位置：噴水池前面、靠鏡頭這一側，一進來就在畫面中間 */
const PLAYER_SPAWN = { x: 0, z: 4.2 };
const NO_KEYS = new Vector3();

export interface CharacterSpec {
  def: ChibiDef;
  tex: Texture;
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
  /** 小人被點到：跳一下說一句話 */
  poke(c: Chibi): void;
  /** 主角走到點的地板位置（點到廣場外面、或正在做任務就不動） */
  walkTo(x: number, y: number): void;
  /**
   * 每幀呼叫：正在做任務就傳進度（進度環），沒有就傳 null。
   * 剛開始做任務時主角會走到委託板前；instant 為 true 時直接站過去（重新整理後用）。
   */
  setWork(work: RingValue | null, instant?: boolean): void;
  helloAll(): void;
  update(dt: number, t: number, keyDir: Vector3): void;
}

export function createLobby(world: ChibiWorld, plaza: Plaza): Lobby {
  let player: Chibi | null = null;
  let all: Chibi[] = [];
  let working = false;

  return {
    get player() { return player; },
    get working() { return working; },

    populate(p, members) {
      if (player) throw new Error('大廳已經有主角了');
      const total = members.length + 1;
      const me = new Chibi(world, p.def, p.tex, 0, total);
      me.pos.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
      all = [me, ...members.map((m, i) => new Chibi(world, m.def, m.tex, i + 1, total))];
      player = me;
      return me;
    },

    pickAt(x, y) {
      const hits = all.filter((c) => c.hit(x, y)).sort((a, b) => b.view.zIndex - a.view.zIndex);
      return hits[0] ?? null;
    },

    poke(c) {
      c.hop(); c.say(pick(POKED));
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

    helloAll() {
      all.forEach((c, i) => setTimeout(() => { c.hop(); c.say(pick(HELLO)); }, i * 110));
    },

    update(dt, t, keyDir) {
      if (!player) return;
      const ctl = { selected: player, keyDir: working ? NO_KEYS : keyDir };
      for (const c of all) c.update(dt, t, all, ctl);
    },
  };
}
