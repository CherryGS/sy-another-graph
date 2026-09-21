import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";

/** Pointer capture keeps sorting inside the plugin iframe and also supports touch.
 * Only dropping commits an order; pointer motion changes the insertion marker. */
export function usePrioritySorting(onMove: (id: string, destination: number) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: string; pointer: number; startY: number; moved: boolean } | null>(
    null,
  );
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const cancel = () => {
    active.current = null;
    setDrop(null);
  };
  const position = (x: number, y: number) => {
    const list = listRef.current,
      drag = active.current;
    if (!list || !drag) return null;
    const bounds = list.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right) return null;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-priority-item]")];
    const source = cards.findIndex((card) => card.dataset.priorityItem === drag.id);
    if (source < 0) return null;
    let slot = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    if (slot < 0) slot = cards.length;
    const destination = slot - Number(source < slot);
    if (destination === source) return null;
    const card = cards[Math.min(slot, cards.length - 1)];
    return { id: card.dataset.priorityItem!, after: slot === cards.length, destination };
  };
  return {
    listRef,
    drop,
    handle: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        const id = event.currentTarget.dataset.priorityId;
        if (event.button !== 0 || !id) return;
        event.preventDefault();
        event.currentTarget.focus();
        active.current = { id, pointer: event.pointerId, startY: event.clientY, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        if (Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
        if (!drag.moved) return;
        const viewport = listRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (viewport) {
          const rect = viewport.getBoundingClientRect();
          if (event.clientY < rect.top + 24) viewport.scrollTop -= 12;
          else if (event.clientY > rect.bottom - 24) viewport.scrollTop += 12;
        }
        const next = position(event.clientX, event.clientY);
        setDrop((previous) =>
          previous?.id === next?.id && previous?.after === next?.after ? previous : next,
        );
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        const next = drag.moved ? position(event.clientX, event.clientY) : null;
        cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (next) onMove(drag.id, next.destination);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === "Escape" && active.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      },
    },
  };
}
