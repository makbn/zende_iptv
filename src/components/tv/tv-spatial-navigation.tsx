"use client";

import { useEffect } from "react";

import { isTvEnvironment } from "@/lib/tv/tv-environment";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video[controls]",
  "[tabindex]:not([tabindex='-1'])",
  "[role='button']",
].join(",");

const OVERLAY_SELECTOR = [
  "[role='dialog']",
  "dialog[open]",
  "[role='menu']",
  "[role='listbox']",
  "[data-slot='select-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='context-menu-content']",
].join(",");

const COMPOSITE_SELECTOR = [
  "[role='menu']",
  "[role='listbox']",
  "[data-slot='select-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='context-menu-content']",
].join(",");

type Direction = "left" | "right" | "up" | "down";
type LayoutMove = { handled: boolean; target: HTMLElement | null };

function isTextField(element: EventTarget | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(
    element.type.toLowerCase(),
  );
}

function guardTextField(element: HTMLInputElement | HTMLTextAreaElement): void {
  if (element.dataset.tvKeyboardGuard === "true" || element.readOnly) return;
  element.dataset.tvKeyboardGuard = "true";
  element.readOnly = true;
}

function guardAllTextFields(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input:not([disabled]), textarea:not([disabled])",
  )) {
    if (isTextField(element)) guardTextField(element);
  }
}

function focusTvElement(element: HTMLElement): void {
  if (isTextField(element)) guardTextField(element);
  element.focus({ preventScroll: true });
}

let pendingRevealFrame: number | null = null;

/** Focus is immediate; potentially expensive layout/scroll work waits a frame. */
function focusAndReveal(
  element: HTMLElement,
  inline: ScrollLogicalPosition = "nearest",
): void {
  focusTvElement(element);
  if (pendingRevealFrame !== null) window.cancelAnimationFrame(pendingRevealFrame);
  pendingRevealFrame = window.requestAnimationFrame(() => {
    pendingRevealFrame = null;
    if (document.activeElement !== element || !element.isConnected) return;
    element.scrollIntoView({ behavior: "auto", block: "nearest", inline });
  });
}

function isVisible(element: HTMLElement): boolean {
  if (element.closest("[hidden], [inert]") || element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function focusableElements(): HTMLElement[] {
  const modal = Array.from(
    document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true'], dialog[open]"),
  ).filter(isVisible).at(-1);
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (modal && !modal.contains(element)) return false;
      if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" || !isVisible(element)) {
        return false;
      }

      // Cards contain secondary icon buttons. Treat the card as one remote stop so
      // directional movement cannot get trapped among controls inside the same tile.
      return !element.parentElement?.closest(FOCUSABLE_SELECTOR);
    },
  );
}

function isQuickFocusable(element: HTMLElement): boolean {
  if (
    element.closest("[hidden], [inert]") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }
  // Match the global rule that treats a card containing icon controls as one
  // remote stop, without forcing style/layout calculation for every element.
  return !element.parentElement?.closest(FOCUSABLE_SELECTOR);
}

function quickLayoutMembers(layout: HTMLElement): HTMLElement[] {
  return Array.from(layout.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.closest<HTMLElement>("[data-tv-layout]") === layout &&
      isQuickFocusable(element),
  );
}

function indexedRailTarget(
  layout: HTMLElement,
  index: number,
): HTMLElement | null {
  const indexed = layout.querySelector<HTMLElement>(`[data-tv-item-index="${index}"]`);
  if (!indexed) return null;
  if (indexed.matches(FOCUSABLE_SELECTOR) && isQuickFocusable(indexed)) return indexed;
  return Array.from(indexed.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .find(isQuickFocusable) ?? null;
}

/** O(1) left/right lookup for large rails that publish their current index. */
function indexedRailNeighbor(
  active: HTMLElement,
  direction: Direction,
): LayoutMove {
  const layout = active.closest<HTMLElement>("[data-tv-layout='horizontal'][data-tv-item-count]");
  if (!layout || (direction !== "left" && direction !== "right")) {
    return { handled: false, target: null };
  }
  const indexed = active.closest<HTMLElement>("[data-tv-item-index]");
  const current = Number(indexed?.dataset.tvItemIndex);
  const count = Number(layout.dataset.tvItemCount);
  if (!Number.isInteger(current) || !Number.isInteger(count) || count <= 0) {
    return { handled: false, target: null };
  }
  const targetIndex = current + (direction === "right" ? 1 : -1);
  return {
    handled: true,
    target: targetIndex >= 0 && targetIndex < count
      ? indexedRailTarget(layout, targetIndex)
      : null,
  };
}

/** Preserve the item column while moving between indexed Home rails. */
function indexedAdjacentRailMember(
  active: HTMLElement,
  direction: "up" | "down",
): HTMLElement | null {
  const currentLayout = active.closest<HTMLElement>(
    "[data-tv-layout='horizontal'][data-tv-item-count]",
  );
  const indexed = active.closest<HTMLElement>("[data-tv-item-index]");
  const currentItem = Number(indexed?.dataset.tvItemIndex);
  if (!currentLayout || !Number.isInteger(currentItem)) return null;

  const rails = Array.from(document.querySelectorAll<HTMLElement>(
    "main [data-tv-layout='horizontal'][data-tv-item-count]",
  ));
  const currentRail = rails.indexOf(currentLayout);
  const targetRail = rails[currentRail + (direction === "down" ? 1 : -1)];
  if (currentRail < 0 || !targetRail) return null;
  const targetCount = Number(targetRail.dataset.tvItemCount);
  if (!Number.isInteger(targetCount) || targetCount <= 0) return null;
  return indexedRailTarget(targetRail, Math.min(currentItem, targetCount - 1));
}

function adjacentLayoutMember(
  active: HTMLElement,
  direction: "up" | "down",
): HTMLElement | null {
  const currentLayout = active.closest<HTMLElement>("[data-tv-layout]");
  if (!currentLayout) return null;
  const modal = active.closest<HTMLElement>("[role='dialog'][aria-modal='true'], dialog[open]");
  const layouts = Array.from(
    (modal ?? document).querySelectorAll<HTMLElement>("[data-tv-layout]"),
  ).filter((layout) => quickLayoutMembers(layout).length > 0);
  const current = layouts.indexOf(currentLayout);
  if (current < 0) return null;
  const step = direction === "down" ? 1 : -1;
  for (let index = current + step; index >= 0 && index < layouts.length; index += step) {
    const first = quickLayoutMembers(layouts[index]!)[0];
    if (first) return first;
  }
  return null;
}

function ownsDirectionalInput(
  element: Element | null,
  direction: Direction,
): boolean {
  if (!(element instanceof HTMLElement)) return false;
  // Keep left/right available for caret movement, but let TV users leave a
  // query field with up/down. Text inputs otherwise become a D-pad trap.
  if (element.matches("input, textarea, [contenteditable='true']")) {
    if (element.dataset.tvNavInput === "spatial") return false;
    return direction === "left" || direction === "right";
  }
  return (
    element.matches("[role='slider']") &&
    (direction === "left" || direction === "right")
  );
}

function directionForEvent(event: KeyboardEvent): Direction | null {
  if (event.key === "ArrowLeft" || event.keyCode === 21 || event.keyCode === 37) return "left";
  if (event.key === "ArrowRight" || event.keyCode === 22 || event.keyCode === 39) return "right";
  if (event.key === "ArrowUp" || event.keyCode === 19 || event.keyCode === 38) return "up";
  if (event.key === "ArrowDown" || event.keyCode === 20 || event.keyCode === 40) return "down";
  return null;
}

function indexedAncestor(element: HTMLElement, layout: HTMLElement): HTMLElement | null {
  const indexed = element.closest<HTMLElement>("[data-tv-index]");
  return indexed && layout.contains(indexed) ? indexed : null;
}

function inferredGridColumns(layout: HTMLElement, members: HTMLElement[]): number | null {
  const configured = Number(layout.dataset.tvColumns);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const indexed = members
    .map((element) => indexedAncestor(element, layout))
    .filter((element): element is HTMLElement => Boolean(element));
  if (indexed.length < 2) return null;
  const firstTop = indexed[0]!.getBoundingClientRect().top;
  const tolerance = Math.max(4, indexed[0]!.getBoundingClientRect().height * 0.25);
  const count = indexed.filter(
    (element) => Math.abs(element.getBoundingClientRect().top - firstTop) <= tolerance,
  ).length;
  return count > 0 ? count : null;
}

function layoutNeighbor(
  active: HTMLElement,
  direction: Direction,
  candidates: HTMLElement[],
): LayoutMove {
  const layout = active.closest<HTMLElement>("[data-tv-layout]");
  if (!layout) return { handled: false, target: null };
  const members = candidates.filter(
    (element) => element.closest<HTMLElement>("[data-tv-layout]") === layout,
  );
  const current = members.indexOf(active);
  if (current < 0) return { handled: false, target: null };

  const kind = layout.dataset.tvLayout;
  if (kind === "horizontal" && (direction === "left" || direction === "right")) {
    return { handled: true, target: members[current + (direction === "right" ? 1 : -1)] ?? null };
  }
  if (kind === "vertical" && (direction === "up" || direction === "down")) {
    return { handled: true, target: members[current + (direction === "down" ? 1 : -1)] ?? null };
  }
  if (kind !== "grid") return { handled: false, target: null };

  const indexed = indexedAncestor(active, layout);
  const index = Number(indexed?.dataset.tvIndex);
  const columns = inferredGridColumns(layout, members);
  if (!Number.isInteger(index) || !columns) return { handled: false, target: null };

  let targetIndex = index;
  if (direction === "left") targetIndex -= 1;
  if (direction === "right") targetIndex += 1;
  if (direction === "up") targetIndex -= columns;
  if (direction === "down") targetIndex += columns;
  if (
    targetIndex < 0 ||
    (direction === "left" && Math.floor(targetIndex / columns) !== Math.floor(index / columns)) ||
    (direction === "right" && Math.floor(targetIndex / columns) !== Math.floor(index / columns))
  ) {
    return { handled: true, target: null };
  }
  const target = members.find(
    (element) => Number(indexedAncestor(element, layout)?.dataset.tvIndex) === targetIndex,
  );
  return { handled: true, target: target ?? null };
}

function firstMemberOfAdjacentLayout(
  active: HTMLElement,
  direction: "up" | "down",
  candidates: HTMLElement[],
): HTMLElement | null {
  const currentLayout = active.closest<HTMLElement>("[data-tv-layout]");
  if (!currentLayout) return null;

  const layouts: HTMLElement[] = [];
  for (const candidate of candidates) {
    const layout = candidate.closest<HTMLElement>("[data-tv-layout]");
    if (layout && !layouts.includes(layout)) layouts.push(layout);
  }

  const current = layouts.indexOf(currentLayout);
  if (current < 0) return null;
  const step = direction === "down" ? 1 : -1;
  for (let index = current + step; index >= 0 && index < layouts.length; index += step) {
    const destination = layouts[index]!;
    const first = candidates.find(
      (candidate) => candidate.closest<HTMLElement>("[data-tv-layout]") === destination,
    );
    if (first) return first;
  }
  return null;
}

function explicitDirectionalTarget(
  active: HTMLElement,
  direction: Direction,
  candidates: HTMLElement[],
): LayoutMove {
  const owner = active.closest<HTMLElement>(`[data-tv-nav-${direction}]`);
  if (!owner) return { handled: false, target: null };

  const selector = owner.dataset[`tvNav${direction[0]!.toUpperCase()}${direction.slice(1)}`];
  if (!selector) return { handled: true, target: null };

  try {
    const destination = document.querySelector<HTMLElement>(selector);
    if (!destination) return { handled: true, target: null };
    const target = candidates.find(
      (candidate) => candidate === destination || destination.contains(candidate),
    );
    return { handled: true, target: target ?? null };
  } catch {
    // A malformed page-level selector must not break global remote navigation.
    return { handled: true, target: null };
  }
}

function firstContentLayoutElement(candidates: HTMLElement[]): HTMLElement | null {
  return candidates.find((candidate) => {
    const layout = candidate.closest<HTMLElement>("[data-tv-layout]");
    return Boolean(layout?.closest("main") && !layout.hasAttribute("data-tv-skip-initial"));
  }) ?? null;
}

function moveFocus(direction: Direction): boolean {
  const active = document.activeElement instanceof HTMLElement && document.activeElement.isConnected
    ? document.activeElement
    : null;
  // The common TV path stays inside a declared rail/grid. Resolve only that
  // small layout instead of measuring every card, nav item, and button in the
  // document on each key press.
  if (active) {
    const indexedMove = indexedRailNeighbor(active, direction);
    if (indexedMove.handled) {
      if (indexedMove.target) {
        focusAndReveal(indexedMove.target);
        return true;
      }
      return false;
    }
    if (direction === "up" || direction === "down") {
      const indexedAdjacent = indexedAdjacentRailMember(active, direction);
      if (indexedAdjacent) {
        focusAndReveal(indexedAdjacent, "start");
        return true;
      }
    }

    const layout = active.closest<HTMLElement>("[data-tv-layout]");
    if (layout) {
      const localMove = layoutNeighbor(active, direction, quickLayoutMembers(layout));
      if (localMove.handled) {
        if (localMove.target) {
          focusAndReveal(localMove.target);
          return true;
        }
        if (direction === "left" || direction === "right") return false;
      }
      if (direction === "up" || direction === "down") {
        const adjacent = adjacentLayoutMember(active, direction);
        if (adjacent) {
          focusAndReveal(adjacent, "start");
          return true;
        }
        if (localMove.handled) return false;
      }
    }
  }

  const candidates = focusableElements();
  if (candidates.length === 0) return false;

  if (!active || !candidates.includes(active)) {
    const initial = firstContentLayoutElement(candidates) ?? candidates.find((element) => element.closest("main")) ?? candidates[0];
    if (initial) focusAndReveal(initial);
    return true;
  }

  const explicitNeighbor = layoutNeighbor(active, direction, candidates);
  if (explicitNeighbor.handled) {
    if (explicitNeighbor.target) {
      focusAndReveal(explicitNeighbor.target);
      return true;
    }
    if (direction === "left" || direction === "right") return false;
  }

  // Page authors can connect distinct decks explicitly. This runs after
  // movement inside the active grid/list, so only an edge item exits it.
  const explicitTarget = explicitDirectionalTarget(active, direction, candidates);
  if (explicitTarget.handled) {
    if (!explicitTarget.target) return false;
    focusAndReveal(explicitTarget.target, "start");
    return true;
  }

  if (direction === "up" || direction === "down") {
    const adjacentStart = firstMemberOfAdjacentLayout(active, direction, candidates);
    if (adjacentStart) {
      focusAndReveal(adjacentStart, "start");
      return true;
    }
    if (explicitNeighbor.handled) return false;
  }

  const source = active.getBoundingClientRect();
  const sourceX = source.left + source.width / 2;
  const sourceY = source.top + source.height / 2;
  const horizontal = direction === "left" || direction === "right";

  let best: { element: HTMLElement; score: number } | null = null;
  for (const element of candidates) {
    if (element === active) continue;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const dx = x - sourceX;
    const dy = y - sourceY;
    if (direction === "left" && dx >= -1) continue;
    if (direction === "right" && dx <= 1) continue;
    if (direction === "up" && dy >= -1) continue;
    if (direction === "down" && dy <= 1) continue;

    const primary = Math.abs(horizontal ? dx : dy);
    const secondary = Math.abs(horizontal ? dy : dx);
    const overlapsAxis = horizontal
      ? rect.bottom >= source.top && rect.top <= source.bottom
      : rect.right >= source.left && rect.left <= source.right;
    const score = primary * 10 + secondary * (overlapsAxis ? 1 : 4);
    if (!best || score < best.score) best = { element, score };
  }

  if (!best) return false;
  focusAndReveal(best.element);
  return true;
}

function hasOpenOverlay(): boolean {
  const overlay = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).some(isVisible);
  const expandedTrigger = Array.from(
    document.querySelectorAll<HTMLElement>("[aria-expanded='true'], [data-popup-open]"),
  ).some(isVisible);
  return overlay || expandedTrigger;
}

function isInsideOpenComposite(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(
    element.closest(COMPOSITE_SELECTOR) ||
    element.matches("[aria-expanded='true'], [data-popup-open]"),
  );
}

function isInsideOpenOverlay(element: Element | null): boolean {
  return element instanceof HTMLElement && Boolean(element.closest(OVERLAY_SELECTOR));
}

function focusOpenOverlay(): boolean {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).filter(isVisible);
  const overlay = overlays.at(-1);
  const first = overlay?.querySelector<HTMLElement>(
    "[role='menuitem'], button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
  );
  if (!first) return false;
  focusTvElement(first);
  return true;
}

function dispatchEscape(): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

function isRemoteOk(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" ||
    event.key === " " ||
    event.keyCode === 23 ||
    event.keyCode === 66
  );
}

type TvBackResult = "overlay" | "history" | "root";

declare global {
  interface Window {
    __zendeTvHandleBack?: () => TvBackResult;
    __zendeTvPageBack?: () => boolean;
    __zendeTvWakePlayer?: () => boolean;
  }
}

function closeTizenApplication(): void {
  const tizenWindow = window as typeof window & {
    tizen?: { application?: { getCurrentApplication?: () => { exit?: () => void } } };
  };
  try {
    tizenWindow.tizen?.application?.getCurrentApplication?.().exit?.();
  } catch {
    /* The hosted page can run without privileged Tizen APIs. */
  }
}

/** Shared D-pad behavior for installed TV shells and modern TV browsers. */
export function TvSpatialNavigation() {
  useEffect(() => {
    if (!isTvEnvironment()) return;
    document.documentElement.dataset.tvInput = "remote";
    guardAllTextFields();
    const keyboardGuardObserver = new MutationObserver(() => guardAllTextFields());
    keyboardGuardObserver.observe(document.body, { childList: true, subtree: true });
    const androidShell = /ZendeTVShell/i.test(navigator.userAgent);
    const density = androidShell ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;
    if (density > 1) {
      document.documentElement.style.setProperty("zoom", String(1 / density));
    }

    let initialFocusDone = false;
    let initialFocusObserver: MutationObserver | null = null;
    let initialFocusFallback: number | null = null;
    const finishInitialFocus = (initial: HTMLElement) => {
      focusTvElement(initial);
      initial.scrollIntoView({ behavior: "auto", block: "nearest", inline: "start" });
      initialFocusDone = true;
      initialFocusObserver?.disconnect();
      if (initialFocusFallback !== null) window.clearTimeout(initialFocusFallback);
    };
    const focusInitialTarget = () => {
      if (initialFocusDone) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement) {
        initialFocusDone = true;
        initialFocusObserver?.disconnect();
        if (initialFocusFallback !== null) window.clearTimeout(initialFocusFallback);
        return;
      }
      const candidates = focusableElements();
      const preferred = document.querySelector<HTMLElement>("main [data-tv-initial-focus]")
        ?? document.querySelector<HTMLElement>("[data-tv-initial-focus]");
      const initial = preferred && candidates.includes(preferred)
        ? preferred
        : firstContentLayoutElement(candidates);
      if (!initial) return;
      finishInitialFocus(initial);
    };
    const initialFocusFrame = window.requestAnimationFrame(focusInitialTarget);
    initialFocusObserver = new MutationObserver(() => {
      focusInitialTarget();
    });
    initialFocusObserver.observe(document.body, { childList: true, subtree: true });
    initialFocusFallback = window.setTimeout(() => {
      if (initialFocusDone) return;
      const candidates = focusableElements();
      const preferred = document.querySelector<HTMLElement>("main [data-tv-initial-focus]")
        ?? document.querySelector<HTMLElement>("[data-tv-initial-focus]");
      const fallback = preferred && candidates.includes(preferred)
        ? preferred
        : firstContentLayoutElement(candidates)
        ?? candidates.find((candidate) => candidate.closest("main"))
        ?? null;
      if (fallback && isVisible(fallback)) finishInitialFocus(fallback);
    }, 3000);

    const handleBack = (): TvBackResult => {
      if (hasOpenOverlay()) {
        dispatchEscape();
        return "overlay";
      }
      if (window.__zendeTvPageBack?.()) {
        return "history";
      }
      if (window.location.pathname !== "/") {
        window.history.back();
        return "history";
      }
      return "root";
    };
    window.__zendeTvHandleBack = handleBack;

    const onKeyDown = (event: KeyboardEvent) => {
      const isTizenBack = event.keyCode === 10009;
      if (isTizenBack) {
        if (handleBack() === "root") {
          closeTizenApplication();
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const wokePlayer = window.__zendeTvWakePlayer?.() ?? false;
      if (wokePlayer && (isRemoteOk(event) || directionForEvent(event))) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isRemoteOk(event)) {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (isTextField(active)) {
          if (active.dataset.tvKeyboardGuard === "true" && active.dataset.tvEditing !== "true") {
            active.readOnly = false;
            active.dataset.tvEditing = "true";
            active.click();
          }
          return;
        }
        if (
          active &&
          !active.matches("[data-tv-card]") &&
          active.matches("button, a[href], [role='button'], [role='menuitem'], [role='tab'], [role='combobox']")
        ) {
          event.preventDefault();
          event.stopPropagation();
          active.click();
          return;
        }
      }

      const direction = directionForEvent(event);
      if (direction && hasOpenOverlay() && !isInsideOpenOverlay(document.activeElement)) {
        event.preventDefault();
        event.stopPropagation();
        focusOpenOverlay();
        return;
      }
      if (
        !direction ||
        event.defaultPrevented ||
        (direction && ownsDirectionalInput(document.activeElement, direction)) ||
        isInsideOpenComposite(document.activeElement)
      ) {
        return;
      }

      // Capture before component libraries see ArrowUp/ArrowDown. Select and menu
      // triggers otherwise interpret those keys as an instruction to open.
      event.preventDefault();
      event.stopPropagation();
      moveFocus(direction);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!isTextField(event.target)) return;
      if (event.target.dataset.tvEditing !== "true") guardTextField(event.target);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!isTextField(event.target) || event.target.dataset.tvKeyboardGuard !== "true") return;
      event.target.readOnly = true;
      delete event.target.dataset.tvEditing;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isTextField(event.target) || event.target.dataset.tvKeyboardGuard !== "true") return;
      event.target.readOnly = false;
      event.target.dataset.tvEditing = "true";
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.cancelAnimationFrame(initialFocusFrame);
      if (pendingRevealFrame !== null) {
        window.cancelAnimationFrame(pendingRevealFrame);
        pendingRevealFrame = null;
      }
      keyboardGuardObserver.disconnect();
      initialFocusObserver?.disconnect();
      if (initialFocusFallback !== null) window.clearTimeout(initialFocusFallback);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "[data-tv-keyboard-guard='true']",
      )) {
        element.readOnly = false;
        delete element.dataset.tvKeyboardGuard;
        delete element.dataset.tvEditing;
      }
      delete window.__zendeTvHandleBack;
      delete document.documentElement.dataset.tvInput;
      if (density > 1) {
        document.documentElement.style.removeProperty("zoom");
      }
    };
  }, []);

  return null;
}
