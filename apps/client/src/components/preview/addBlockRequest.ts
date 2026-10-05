// "Add block" can start from the Blocks header, the empty list, the preview
// frame hint or Analytics (Screen Review 035 I01, 006 I09, 093 I22). The Page
// destination listens.

const EVENT = "amped:add-block";

// A request made from another destination waits until Page mounts and listens
let pending = false;
let listeners = 0;

export function requestAddBlock() {
  if (listeners === 0) {
    pending = true;
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onAddBlockRequest(handler: () => void) {
  window.addEventListener(EVENT, handler);
  listeners += 1;
  if (pending) {
    pending = false;
    handler();
  }
  return () => {
    window.removeEventListener(EVENT, handler);
    listeners -= 1;
  };
}
