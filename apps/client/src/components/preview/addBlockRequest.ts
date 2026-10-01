// "Add block" can start from the Blocks header, the empty list, or the preview
// frame hint (Screen Review 035 I01, 006 I09). The Page destination listens.

const EVENT = "amped:add-block";

export function requestAddBlock() {
  window.dispatchEvent(new Event(EVENT));
}

export function onAddBlockRequest(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
