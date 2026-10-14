// 公會作品集（T15）：全部交過的作業照片，照交件時間排（新的在前）。
// 大廳展台只放得下最近 5 張，被擠下來的作業在這裡還看得到。
import { courseInfo, type CourseInfo } from './courses';
import { isSubmitted } from './state';
import type { GuildState } from './types';

export interface GalleryWork {
  commissionId: string;
  /** 作業名稱 */
  title: string;
  /** 課程（名稱、交件後變成的部位；畫面用它決定顏色） */
  course: CourseInfo;
  submittedAt: number;
  photoId: string;
  /** 現在還放在大廳展台上 */
  onExhibit: boolean;
}

export function galleryWorks(s: GuildState): GalleryWork[] {
  const shown = new Set(s.exhibits);
  return s.commissions
    .filter((c) => isSubmitted(c) && c.photoId)
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
    .map((c) => {
      const photoId = c.photoId ?? '';
      return {
        commissionId: c.id, title: c.title, course: courseInfo(s, c.course),
        submittedAt: c.submittedAt ?? 0, photoId, onExhibit: shown.has(photoId),
      };
    });
}
