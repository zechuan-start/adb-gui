import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { X, Download } from "lucide-react";

export function UpdateChecker() {
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof check>> | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    check().then((u) => {
      if (u?.available) setUpdate(u);
    }).catch(() => {});
  }, []);

  if (!update?.available || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg p-4 shadow-lg max-w-sm z-50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-medium">Update Available</div>
            <div className="text-xs text-muted-foreground">v{update.version}</div>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {update.body && (
        <div className="text-xs text-muted-foreground mt-2 max-h-32 overflow-auto">{update.body}</div>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={async () => {
            await update.downloadAndInstall();
            await relaunch();
          }}
          className="bg-primary text-primary-foreground text-sm font-medium rounded-md px-3 py-1.5 hover:bg-primary/90 transition-colors"
        >
          Install & Restart
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="bg-secondary text-foreground text-sm rounded-md px-3 py-1.5 hover:bg-secondary/80 transition-colors"
        >
          Later
        </button>
      </div>
    </div>
  );
}
