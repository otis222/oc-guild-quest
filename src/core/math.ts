// 小工具：隨機、夾值、內插、平滑追蹤（與 legacy demo 相同）

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export const pick = <T>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 跟幀率無關的平滑追蹤：k 越大追得越快 */
export const damp = (a: number, b: number, k: number, dt: number): number => lerp(a, b, 1 - Math.exp(-k * dt));
