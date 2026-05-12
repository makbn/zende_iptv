/** Cross-browser fullscreen helpers (mobile Safari, legacy WebKit, Firefox). */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
  webkitRequestFullScreen?: () => void;
  mozRequestFullScreen?: () => void;
  msRequestFullscreen?: () => void;
};

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitCancelFullScreen?: () => void;
  webkitExitFullscreen?: () => void;
  mozFullScreenElement?: Element | null;
  mozCancelFullScreen?: () => void;
  msFullscreenElement?: Element | null;
  msExitFullscreen?: () => void;
};

type VideoFs = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitExitFullScreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export function getPresentationFullscreenElement(): Element | null {
  const d = document as FsDocument;
  return (
    document.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

export async function requestFullscreenElement(el: HTMLElement): Promise<void> {
  const t = el as FsElement;
  if (typeof t.requestFullscreen === "function") {
    try {
      await t.requestFullscreen({ navigationUI: "hide" } as FullscreenOptions);
    } catch {
      await t.requestFullscreen();
    }
    return;
  }
  if (typeof t.webkitRequestFullscreen === "function") {
    t.webkitRequestFullscreen();
    return;
  }
  if (typeof t.webkitRequestFullScreen === "function") {
    t.webkitRequestFullScreen();
    return;
  }
  if (typeof t.mozRequestFullScreen === "function") {
    t.mozRequestFullScreen();
    return;
  }
  if (typeof t.msRequestFullscreen === "function") {
    t.msRequestFullscreen();
    return;
  }
  throw new Error("Fullscreen API not supported on this element");
}

export async function exitPresentationFullscreen(): Promise<void> {
  const d = document as FsDocument;
  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen();
    return;
  }
  if (typeof d.webkitExitFullscreen === "function") {
    d.webkitExitFullscreen();
    return;
  }
  if (typeof d.webkitCancelFullScreen === "function") {
    d.webkitCancelFullScreen();
    return;
  }
  if (typeof d.mozCancelFullScreen === "function") {
    d.mozCancelFullScreen();
    return;
  }
  if (typeof d.msExitFullscreen === "function") {
    d.msExitFullscreen();
  }
}

export function tryWebkitVideoEnterFullscreen(video: HTMLVideoElement): boolean {
  const v = video as VideoFs;
  if (typeof v.webkitEnterFullscreen !== "function") return false;
  try {
    v.webkitEnterFullscreen();
    return true;
  } catch {
    return false;
  }
}

export function tryWebkitVideoExitFullscreen(video: HTMLVideoElement): boolean {
  const v = video as VideoFs;
  if (typeof v.webkitExitFullscreen === "function") {
    try {
      v.webkitExitFullscreen();
      return true;
    } catch {
      /* try alternate casing */
    }
  }
  if (typeof v.webkitExitFullScreen === "function") {
    try {
      v.webkitExitFullScreen();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function videoWebkitDisplayingFullscreen(video: HTMLVideoElement): boolean {
  return Boolean((video as VideoFs).webkitDisplayingFullscreen);
}
