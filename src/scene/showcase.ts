// 大廳跟著存檔變的東西（企劃表 T6）：招牌旁的公會等級、主角腳下光圈的顏色、頭上的名牌、展台上的展品。
// 每次存檔變了就呼叫一次，只會更新有變的部分；照片從 IndexedDB 讀，讀完才換上去。
import * as THREE from 'three';
import { mostVivid } from '../core/palette';
import { EXHIBIT_SLOTS } from '../core/submit';
import type { GuildState } from '../core/types';
import type { Chibi } from './chibi';
import type { Exhibits } from './exhibits';
import type { Plaza } from './plaza';
import { loadTexture } from './sprites';

export interface ShowcaseDeps {
  plaza: Plaza;
  exhibits: Exhibits;
  player: Chibi;
  /** 照片 id → 網址；讀不到回傳 null */
  photoUrl(id: string): Promise<string | null>;
  /** 招牌旁等級牌上的字（「公會等級」） */
  levelLabel: string;
}

export function createShowcase(d: ShowcaseDeps): (s: GuildState) => void {
  let level = 0;
  let ring: string | null | undefined;
  let plate: string | null | undefined;
  /** 每座展台想放的照片（讀圖要時間，讀好時還是這張才放上去） */
  const wanted: (string | null)[] = [];
  const textures = new Map<string, Promise<THREE.Texture | null>>();
  const loader = new THREE.TextureLoader();

  function photoTexture(id: string): Promise<THREE.Texture | null> {
    let p = textures.get(id);
    if (!p) {
      p = d.photoUrl(id).then(async (url) => {
        if (!url) return null;
        const tex = await loader.loadAsync(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }).catch((err: unknown) => {
        console.warn('展品照片載入失敗', id, err);
        return null;
      });
      textures.set(id, p);
    }
    return p;
  }

  async function showPlate(id: string | null): Promise<void> {
    const tex = id ? await d.photoUrl(id).then((url) => (url ? loadTexture(url) : null)) : null;
    if (plate === id) d.player.setNameplate(tex);
  }

  return (s) => {
    if (s.guildLevel !== level) {
      level = s.guildLevel;
      d.plaza.setGuildLevel(level, d.levelLabel);
    }
    const nextRing = s.oc.palette?.length ? mostVivid(s.oc.palette) : null;
    if (nextRing !== ring) {
      ring = nextRing;
      d.plaza.setRingColor(ring);
    }
    const nextPlate = s.oc.nameplatePhotoId ?? null;
    if (nextPlate !== plate) {
      plate = nextPlate;
      showPlate(nextPlate).catch((err: unknown) => console.warn('名牌圖載入失敗', err));
    }
    for (let slot = 0; slot < EXHIBIT_SLOTS; slot++) {
      const id = s.exhibits[slot] || null;
      if (slot in wanted && wanted[slot] === id) continue;
      wanted[slot] = id;
      if (!id) { d.exhibits.show(slot, null); continue; }
      void photoTexture(id).then((tex) => { if (wanted[slot] === id) d.exhibits.show(slot, tex); });
    }
  };
}
