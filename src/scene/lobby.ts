// 大廳裡的角色：一隻主角（玩家的 OC，固定被選取、鏡頭跟著）＋公會成員（自己閒逛、打招呼，不能操控）。
import type { Texture } from 'pixi.js';
import type { Vector3 } from 'three';
import { pick } from '../core/math';
import { Chibi, HELLO, POKED, type ChibiDef, type ChibiWorld } from './chibi';
import { FOUNTAIN_R, WALK_R } from './constants';
import type { Plaza } from './plaza';

/** 公會成員頭上顯示的名字 */
export const MEMBER_LABEL = '公會成員';
/** 主角進大廳的位置：噴水池前面、靠鏡頭這一側，一進來就在畫面中間 */
const PLAYER_SPAWN = { x: 0, z: 4.2 };

export interface CharacterSpec {
  def: ChibiDef;
  tex: Texture;
}

export interface Lobby {
  /** 主角；還沒建立 OC 之前是 null */
  readonly player: Chibi | null;
  /** 放進主角和公會成員（只呼叫一次），回傳主角 */
  populate(player: CharacterSpec, members: readonly CharacterSpec[]): Chibi;
  /** 點到小人：那隻跳一下說話（選取不變，永遠是主角）；點到地板：主角走過去 */
  tap(x: number, y: number): void;
  helloAll(): void;
  update(dt: number, t: number, keyDir: Vector3): void;
}

export function createLobby(world: ChibiWorld, plaza: Plaza): Lobby {
  let player: Chibi | null = null;
  let all: Chibi[] = [];

  return {
    get player() { return player; },

    populate(p, members) {
      if (player) throw new Error('大廳已經有主角了');
      const total = members.length + 1;
      const me = new Chibi(world, p.def, p.tex, 0, total);
      me.pos.set(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z);
      all = [me, ...members.map((m, i) => new Chibi(world, m.def, m.tex, i + 1, total))];
      player = me;
      return me;
    },

    tap(x, y) {
      if (!player) return;
      const hits = all.filter((c) => c.hit(x, y)).sort((a, b) => b.view.zIndex - a.view.zIndex);
      if (hits.length) { hits[0].hop(); hits[0].say(pick(POKED)); return; }
      const p = world.rig.floorPoint(x, y);
      if (!p) return;
      const r = Math.hypot(p.x, p.z);
      if (r > 9.4) return;
      if (r > WALK_R) { p.x *= WALK_R / r; p.z *= WALK_R / r; }
      if (r < FOUNTAIN_R + 0.2) { const k = (FOUNTAIN_R + 0.3) / (r || 1); p.x *= k; p.z *= k; }
      player.manual = true; player.goTo(p.x, p.z);
      plaza.showMarker(p.x, p.z);
    },

    helloAll() {
      all.forEach((c, i) => setTimeout(() => { c.hop(); c.say(pick(HELLO)); }, i * 110));
    },

    update(dt, t, keyDir) {
      if (!player) return;
      const ctl = { selected: player, keyDir };
      for (const c of all) c.update(dt, t, all, ctl);
    },
  };
}
