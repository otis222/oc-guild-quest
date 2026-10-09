// public/sprites/manifest.json 的格式與檢查

export interface SpriteEntry {
  file: string;
  name: string;
}

export interface SpriteManifest {
  /** 主角沒有上傳圖時的預設剪影 */
  playerDefault: string;
  /** 公會成員（佔位圖） */
  members: SpriteEntry[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isFile = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('..') && !/^[a-z]+:/i.test(v);

/** 把 manifest.json 轉成型別；格式不對就丟錯，不默默略過 */
export function parseManifest(json: unknown): SpriteManifest {
  if (!isObj(json)) throw new Error('manifest 不是物件');
  const { player_default: playerDefault, members } = json;
  if (!isFile(playerDefault)) throw new Error('manifest 缺 player_default');
  if (!Array.isArray(members)) throw new Error('manifest 缺 members');
  return {
    playerDefault,
    members: members.map((m, i) => {
      if (!isObj(m) || !isFile(m.file) || typeof m.name !== 'string') throw new Error(`manifest members[${i}] 格式不對`);
      return { file: m.file, name: m.name };
    }),
  };
}
