// 公會作品集（T15）：交過的作業照片排成兩欄，新的在前；還在大廳展台上的標「展台上」。
// 點一張放大看，關掉回到作品集（捲回原本的位置）。照片只從這個瀏覽器的 IndexedDB 讀。
import { galleryWorks, type GalleryWork } from '../core/gallery';
import { monthDay } from '../core/ocCard';
import type { GuildStore } from '../core/store';
import { COPY } from './copy';
import { el, on } from './dom';
import { openDialog } from './overlay';
import { openPhotoViewer } from './photoViewer';
import type { PhotoUrls } from './photos';
import { courseColor } from './pie';

export interface GalleryDeps {
  store: GuildStore;
  photos: PhotoUrls;
  /** 關掉作品集以後（點開照片放大看不算） */
  onClosed?(): void;
}

/** 從放大的照片回到作品集時：捲回原本的位置，焦點回到剛剛點的那一張 */
interface Resume {
  scrollTop: number;
  commissionId: string;
}

const G = COPY.gallery;

export function openGallery(deps: GalleryDeps, resume?: Resume): void {
  let viewing = false;
  const dialog = openDialog({
    title: G.title(galleryWorks(deps.store.state).length),
    onClose: () => { unsubscribe(); if (!viewing) deps.onClosed?.(); },
  });
  const scroller = dialog.body.closest<HTMLElement>('.overlay');
  const unsubscribe = deps.store.subscribe(render);
  render();
  if (resume) {
    if (scroller) scroller.scrollTop = resume.scrollTop;
    dialog.body.querySelector<HTMLElement>(`[data-id="${CSS.escape(resume.commissionId)}"]`)?.focus({ preventScroll: true });
  }

  function render(): void {
    const works = galleryWorks(deps.store.state);
    dialog.setTitle(G.title(works.length));
    dialog.body.replaceChildren(works.length
      ? el('ul', { class: 'gallery' }, ...works.map(item))
      : el('p', { class: 'gallery-empty' }, G.empty));
  }

  function item(w: GalleryWork): HTMLElement {
    const md = monthDay(w.submittedAt);
    const img = el('img', { alt: '', draggable: 'false' });
    const thumb = el('span', { class: 'gallery-thumb' }, img, w.onExhibit ? el('span', { class: 'gallery-badge' }, G.onExhibit) : null);
    const button = el('button', {
      type: 'button', class: 'gallery-item', 'data-id': w.commissionId, style: `--c: ${courseColor(w.course)}`,
      'aria-label': G.itemAria(w.course.label, w.title, md, w.onExhibit),
    },
    thumb,
    el('span', { class: 'gallery-title' }, w.title),
    el('span', { class: 'gallery-meta' }, el('span', { class: 'gallery-course' }, w.course.label), el('span', {}, G.date(md))));
    const url = deps.photos.now(w.photoId);
    if (url) img.src = url;
    else {
      void deps.photos.get(w.photoId).then((u) => {
        if (u) { img.src = u; return; }
        thumb.append(el('span', { class: 'gallery-missing' }, G.missing));
        button.disabled = true;
      });
    }
    on(button, 'click', () => view(w, md));
    return el('li', {}, button);
  }

  function view(w: GalleryWork, md: string): void {
    void deps.photos.get(w.photoId).then((url) => {
      if (!url) return;
      const back: Resume = { scrollTop: scroller?.scrollTop ?? 0, commissionId: w.commissionId };
      viewing = true;
      openPhotoViewer({
        url, title: COPY.viewer.work, alt: COPY.submit.photoAlt(w.title),
        caption: COPY.viewer.caption(w.course.label, w.title, md),
        onClose: () => openGallery(deps, back),
      });
    });
  }
}
