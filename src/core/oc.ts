// 主角 OC 與公會成員的小規則
import type { SpriteEntry } from './manifest';
import { cleanText } from './text';

/** OC 名字最多幾個字（名字會顯示在小人頭上，太長會擋到別人） */
export const OC_NAME_MAX = 12;
/** 大廳裡最多幾隻公會成員 */
export const MAX_GUILD_MEMBERS = 6;

const UPLOAD_PREFIX = 'upload:';

/** 上傳的圖存成照片後，OCProfile.sprite 寫成 upload:<照片 id> */
export const uploadSpriteRef = (photoId: string): string => `${UPLOAD_PREFIX}${photoId}`;

/** OCProfile.sprite 如果是上傳的圖，回傳照片 id；是 AI 小人檔名就回傳 null */
export function uploadedPhotoId(sprite: string): string | null {
  return sprite.startsWith(UPLOAD_PREFIX) ? sprite.slice(UPLOAD_PREFIX.length) : null;
}

/** 整理玩家輸入的名字：去掉前後空白、連續空白變一個、超過上限就截掉 */
export const cleanOcName = (input: string): string => cleanText(input, OC_NAME_MAX);

/** 公會成員：照 manifest 順序，排除玩家選的那隻，最多 max 隻 */
export function pickGuildMembers(members: readonly SpriteEntry[], playerSprite: string, max = MAX_GUILD_MEMBERS): SpriteEntry[] {
  return members.filter((m) => m.file !== playerSprite).slice(0, max);
}
