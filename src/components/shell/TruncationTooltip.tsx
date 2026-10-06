import { useEffect, useState } from "react";

interface Tip {
  text: string;
  left: number;
  top: number;
}

/** The nearest element (self or ancestor) whose text is cut off with an ellipsis. */
function truncatedAncestor(start: EventTarget | null): HTMLElement | null {
  let el = start instanceof HTMLElement ? start : null;
  for (let i = 0; el && i < 6; i += 1, el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis") return el;
  }
  return null;
}

/**
 * One tooltip for every truncated text in the app: hovering text that ends in
 * an ellipsis shows the full text in an overlay. Mounted once in the shell, so
 * no component needs to opt in.
 */
export function TruncationTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;

    const hide = () => {
      current = null;
      window.clearTimeout(timer);
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      const el = truncatedAncestor(e.target);
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      timer = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!text) return;
        setTip({ text, left: Math.min(Math.max(8, r.left), window.innerWidth - 328), top: r.bottom + 6 });
      }, 300);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      style={{ left: tip.left, top: tip.top }}
      className="pointer-events-none fixed z-[100] max-w-xs break-words rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
    >
      {tip.text}
    </div>
  );
}
