// 讀 public/sprites/manifest.json 和小人圖
import { Texture } from 'pixi.js';
import { parseManifest, type SpriteManifest } from '../core/manifest';

/** public/sprites/ 底下檔案的網址（跟著 vite base 走，部署到子路徑也不會壞） */
export const spriteUrl = (file: string): string => `${import.meta.env.BASE_URL}sprites/${file}`;

export async function loadManifest(): Promise<SpriteManifest> {
  const res = await fetch(spriteUrl('manifest.json'));
  if (!res.ok) throw new Error(`讀不到 sprites/manifest.json（${res.status}）`);
  return parseManifest(await res.json());
}

export async function loadTexture(src: string): Promise<Texture> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return Texture.from(img);
}
