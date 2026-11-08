import React from "react";

export type DisplayPart = string | number | boolean | null | undefined;
const sameParts = (a: readonly DisplayPart[], b: readonly DisplayPart[]) =>
  a.length === b.length && a.every((part, index) => Object.is(part, b[index]));

// Compare only the small, explicitly supplied display fields. Object identity
// and publication revisions never trigger a transition.
export function useChangedPresentation<T>(incoming: T, parts: readonly DisplayPart[],
  targets: () => readonly Element[], enabled = true) {
  const [committed, setCommitted] = React.useState(() => [...parts]);
  const [phase, setPhase] = React.useState<"idle" | "out" | "in">("idle");
  const visible = React.useRef({ parts: [...parts], value: incoming });
  const requested = React.useRef([...parts]);
  const latest = React.useRef({ parts, value: incoming });
  const targetRef = React.useRef(targets);
  targetRef.current = targets;
  const animations = React.useRef<Animation[]>([]);
  const generation = React.useRef(0);
  const enterPending = React.useRef(false);
  const displaysIncoming = !enabled || sameParts(parts, committed);
  const fade = React.useCallback((opacity: number, duration: number, easing: string) => {
    const starts = targetRef.current().map(element => ({ element, opacity: getComputedStyle(element).opacity }));
    animations.current.forEach(animation => animation.cancel());
    animations.current = starts.map(({ element, opacity: from }) => element.animate(
      [{ opacity: from }, { opacity }], { duration, easing, fill: "forwards" },
    ));
    return Promise.all(animations.current.map(animation => animation.finished)).catch(() => null);
  }, []);
  React.useLayoutEffect(() => {
    latest.current = { parts: [...parts], value: incoming };
    if (displaysIncoming) visible.current = { parts: [...parts], value: incoming };
  });
  React.useLayoutEffect(() => {
    if (!enabled) {
      generation.current++;
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
      requested.current = [...parts];
      enterPending.current = false;
      if (!sameParts(committed, parts)) setCommitted([...parts]);
      if (phase !== "idle") setPhase("idle");
      return;
    }
    if (sameParts(requested.current, parts)) return;
    requested.current = [...parts];
    const token = ++generation.current;
    if (sameParts(visible.current.parts, parts)) {
      enterPending.current = false;
      setPhase("in");
      void fade(1, 150, "ease-out").then(done => { if (done && token === generation.current) setPhase("idle"); });
      return;
    }
    setPhase("out");
    void fade(0, 100, "linear").then(done => {
      if (!done || token !== generation.current) return;
      enterPending.current = true;
      setCommitted([...latest.current.parts]);
      setPhase("in");
    });
  });
  React.useLayoutEffect(() => {
    if (!enterPending.current || !enabled) return;
    enterPending.current = false;
    const token = generation.current;
    void fade(1, 150, "ease-out").then(done => { if (done && token === generation.current) setPhase("idle"); });
  }, [committed, enabled, fade]);
  React.useLayoutEffect(() => () => {
    generation.current++;
    animations.current.forEach(animation => animation.cancel());
  }, []);
  return { value: displaysIncoming ? incoming : visible.current.value, changing: enabled && phase !== "idle", phase };
}

export default function DashboardValueTransition({ parts, children, enabled = true, as = "span", ...props }: {
  parts: readonly DisplayPart[]; children: React.ReactNode; enabled?: boolean; as?: "span" | "strong";
} & React.HTMLAttributes<HTMLSpanElement>) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const presentation = useChangedPresentation(children, parts, () => ref.current ? [ref.current] : [], enabled);
  return React.createElement(as, { ...props, ref, "data-dashboard-change": "", "data-change-phase": presentation.phase }, presentation.value);
}
