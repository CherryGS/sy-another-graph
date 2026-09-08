import { useEffect, useState } from "react";

/** Yield simulation work for a panel scroll gesture, including portaled panels. */
export function usePanelScrolling() {
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-scroll-panel]")
      )
        return;
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setScrolling(false), 180);
    };
    document.addEventListener("wheel", onScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("wheel", onScroll, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("touchmove", onScroll, true);
    };
  }, []);
  return scrolling;
}
