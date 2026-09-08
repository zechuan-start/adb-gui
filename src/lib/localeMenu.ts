import { useLocaleStore } from "@/store/locale";
import { emitLocaleChanged } from "@/lib/tauri";

// Start after module initialization to keep the locale store independent of
// the bridge and its consumers. The store applies document.lang before render.
export function startLocaleMenuSync(): () => void {
  function sync(): void {
    void emitLocaleChanged(useLocaleStore.getState().locale).catch((error) => {
      console.error("Failed to synchronize native menu language", error);
    });
  }
  const unsubscribe = useLocaleStore.subscribe((state, previous) => {
    if (state.locale !== previous.locale) sync();
  });
  sync();
  return unsubscribe;
}
