import { initialWindowMetrics, useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

/**
 * Safe-area insets for system bars (status bar, notch, gesture/navigation bar).
 *
 * Android draws edge-to-edge, so the app must pad itself away from the system bars. The
 * context value can briefly be 0 (or mis-measured inside nested navigators); the insets
 * the OS reported natively at launch are used as a floor. The app is portrait-only, so
 * those launch values stay valid.
 */
export function useSystemInsets(): EdgeInsets {
  const live = useSafeAreaInsets();
  const launch = initialWindowMetrics?.insets;
  return {
    top: Math.max(live.top, launch?.top ?? 0),
    bottom: Math.max(live.bottom, launch?.bottom ?? 0),
    left: Math.max(live.left, launch?.left ?? 0),
    right: Math.max(live.right, launch?.right ?? 0),
  };
}
