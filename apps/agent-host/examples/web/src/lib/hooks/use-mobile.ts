import { useSyncExternalStore } from "react";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(MOBILE_MEDIA_QUERY);

  media.addEventListener("change", callback);

  return () => {
    media.removeEventListener("change", callback);
  };
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export { useIsMobile };
