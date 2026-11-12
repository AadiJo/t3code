import { useAtomMount } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { createThreadVisitTracker } from "@t3tools/client-runtime/state/thread-visits";
import { type ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { useUiStateStore } from "../../uiStateStore";
import { environmentThreadShells, threadEnvironment } from "../../state/threads";

// A background window does not count as a visit: a turn that finishes while
// the user is elsewhere stays unread until the window has focus again.
const windowFocusedAtom = Atom.make((get) => {
  const sync = () => get.setSelf(document.hasFocus());
  window.addEventListener("focus", sync);
  window.addEventListener("blur", sync);
  get.addFinalizer(() => {
    window.removeEventListener("focus", sync);
    window.removeEventListener("blur", sync);
  });
  return document.hasFocus();
});

const threadVisitTracker = createThreadVisitTracker({
  threadShellAtom: environmentThreadShells.threadShellAtom,
  visit: threadEnvironment.visit,
  markLocalVisit: (ref, visitedAt) =>
    useUiStateStore.getState().markThreadVisited(scopedThreadKey(ref), visitedAt),
  viewingAtom: windowFocusedAtom,
});

// The visit watermark is the one part of the chat view that follows the
// shell's updatedAt, which ticks while a run streams. The tracker subscribes to
// it outside React, so ChatView keeps reading the quiet shell.
export function ThreadVisitWatermark(props: { readonly threadRef: ScopedThreadRef }) {
  useAtomMount(threadVisitTracker(props.threadRef));
  return null;
}
