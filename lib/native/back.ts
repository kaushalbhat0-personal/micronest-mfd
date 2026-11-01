/**
 * MFD-64 release — centralized Android hardware-back support.
 *
 * Priority (handled by NativeAppProvider's single backButton listener):
 *   1. Dismiss the topmost registered overlay (dialog/sheet), if any.
 *   2. Else follow WebView history via router.back().
 *   3. Else (app root) ask once with a calm confirm before exiting.
 *
 * Overlays opt in explicitly via pushBackDismiss() — no global modal
 * framework, no introspection of dialog internals. Each registrant returns
 * true when it consumed the press (dismissed something), false when it is
 * busy (e.g. mid-import) and the press should fall through.
 *
 * Pure stack helpers are unit-testable in Node; the confirm/exit decision
 * helper is pure too. No Capacitor imports here.
 */

type BackDismissFn = () => boolean;

const dismissStack: BackDismissFn[] = [];

/**
 * Register an overlay dismiss handler. Returns an unregister function the
 * caller must run on close/unmount. Last registered = topmost.
 */
export function pushBackDismiss(fn: BackDismissFn): () => void {
  dismissStack.push(fn);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const index = dismissStack.lastIndexOf(fn);
    if (index !== -1) dismissStack.splice(index, 1);
  };
}

/** Run the topmost dismiss handler. True when the press was consumed. */
export function tryDismissTop(): boolean {
  const top = dismissStack[dismissStack.length - 1];
  if (!top) return false;
  try {
    return top();
  } catch {
    return false;
  }
}

/** Test-only reset for the dismiss stack. */
export function __resetBackDismissForTests(): void {
  dismissStack.length = 0;
}

/**
 * Decide the root-back outcome. Pure: true means exit the app, false means
 * stay. The caller shows the confirm; tests assert the mapping, never UI.
 */
export function resolveRootBack(confirmed: boolean): boolean {
  return confirmed;
}
