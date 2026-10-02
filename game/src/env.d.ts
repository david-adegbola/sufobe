/** True in the normal Vite build (offline app); false in the single-file artifact build and in tests. */
declare const __PWA__: boolean;
/** Painted layers in public/art: name (e.g. hills-summer) → URL (web build) or data URL (one-file build). */
declare const __ART__: Record<string, string>;
