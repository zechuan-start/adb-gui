import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Download,
  File,
  FileImage,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Link,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import {
  buildDeviceBreadcrumbs,
  createDeviceFileManagerState,
  deviceFileManagerReducer,
  deviceTransferSummary,
  deviceFileTypeLabel,
  formatDeviceFileSize,
  formatDeviceModifiedAt,
  hasLoadedDeviceDirectory,
  invalidateDeviceOperationContext,
  isDeviceDirectoryViewLoading,
  isDeviceOperationContextCurrent,
  isDeviceTransferBusy,
  localFileName,
  updateDeviceOperationContext,
  type DeviceOperationContext,
  type DeviceTransferBatch,
} from "@/lib/deviceFiles";
import {
  createDeviceDirectory,
  downloadDeviceFile,
  isTauriRuntime,
  listDeviceDirectory,
  onDragDrop,
  pickDeviceDownloadPath,
  pickDeviceUploadFiles,
  previewDeviceImage,
  revealFile,
  uploadDeviceFile,
  type DeviceFileEntry,
} from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { cn } from "@/lib/utils";

interface DeviceFileManagerProps {
  active?: boolean;
}

export function DeviceFileManager({ active = true }: DeviceFileManagerProps) {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const showToast = useFeedbackStore((state) => state.showToast);
  const device = getDeviceBySerial(devices, selectedDevice);
  const onlineSerial = device && isOnlineDevice(device) ? device.serial : null;
  const operationContextRef = useRef<DeviceOperationContext>({
    serial: onlineSerial,
    revision: 0,
  });

  const [state, dispatch] = useReducer(
    deviceFileManagerReducer,
    onlineSerial,
    createDeviceFileManagerState,
  );
  const [dragActive, setDragActive] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const listRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const operationBusyRef = useRef(false);
  const activeRef = useRef(active);

  activeRef.current = active;

  const contextMatches = state.serial === onlineSerial;
  const visiblePath = contextMatches ? state.path : "";
  const visibleEntries = contextMatches ? state.entries : [];
  const visibleTransfer = contextMatches ? state.transfer : null;
  const selectedEntry = useMemo(
    () =>
      contextMatches
        ? state.entries.find((entry) => entry.path === state.selectedPath) ?? null
        : null,
    [contextMatches, state.entries, state.selectedPath],
  );
  const breadcrumbs = useMemo(() => buildDeviceBreadcrumbs(visiblePath), [visiblePath]);
  const transferBusy = isDeviceTransferBusy(visibleTransfer);
  const contextReady = Boolean(onlineSerial && contextMatches && visiblePath);
  const directoryLoaded = hasLoadedDeviceDirectory(state, onlineSerial);
  const directoryLoading = isDeviceDirectoryViewLoading(state, onlineSerial);
  const controlsDisabled =
    !contextReady || operationBusy || transferBusy || folderBusy || state.listLoading;

  useLayoutEffect(() => {
    operationContextRef.current = updateDeviceOperationContext(
      operationContextRef.current,
      onlineSerial,
    );
    operationBusyRef.current = false;
    setOperationBusy(false);
    setFolderBusy(false);
    return () => {
      operationContextRef.current = invalidateDeviceOperationContext(
        operationContextRef.current,
      );
      operationBusyRef.current = false;
    };
  }, [onlineSerial]);

  const loadDirectory = useCallback(
    async (serial: string, path: string | null) => {
      const requestId = ++listRequestRef.current;
      dispatch({ type: "list-start", serial, requestId });
      try {
        const listing = await listDeviceDirectory(serial, path);
        if (!activeRef.current || requestId !== listRequestRef.current) {
          return;
        }
        dispatch({ type: "list-success", serial, requestId, listing });
      } catch (error) {
        if (!activeRef.current || requestId !== listRequestRef.current) {
          return;
        }
        const message = errorMessage(error);
        dispatch({ type: "list-error", serial, requestId, error: message });
        if (
          operationContextRef.current.serial === serial &&
          requestId === listRequestRef.current
        ) {
          showToast("error", message);
        }
      }
    },
    [showToast],
  );

  const loadPreview = useCallback(async (serial: string, entry: DeviceFileEntry) => {
    const requestId = ++previewRequestRef.current;
    dispatch({ type: "preview-start", serial, requestId, path: entry.path });
    try {
      const data = await previewDeviceImage(serial, entry.path);
      dispatch({ type: "preview-success", serial, requestId, path: entry.path, data });
    } catch (error) {
      dispatch({
        type: "preview-error",
        serial,
        requestId,
        path: entry.path,
        error: errorMessage(error),
      });
    }
  }, []);

  useEffect(() => {
    listRequestRef.current += 1;
    previewRequestRef.current += 1;

    if (!active || !isTauriRuntime()) {
      setDragActive(false);
      return;
    }

    dispatch({ type: "reset", serial: onlineSerial });
    setDragActive(false);
    setFolderDialogOpen(false);
    setFolderName("");
    setFolderError("");
    if (onlineSerial) {
      void loadDirectory(onlineSerial, null);
    }
  }, [active, loadDirectory, onlineSerial]);

  const startUpload = useCallback(
    async (paths: string[], capturedContext?: DeviceOperationContext) => {
      const operationContext = capturedContext ?? operationContextRef.current;
      const serial = operationContext.serial;
      const remoteDir = state.path;
      if (
        !serial ||
        !isDeviceOperationContextCurrent(operationContextRef.current, operationContext) ||
        state.serial !== serial ||
        !remoteDir ||
        paths.length === 0 ||
        folderDialogOpen ||
        folderBusy ||
        state.listLoading
      ) {
        return;
      }
      if (operationBusyRef.current) {
        showToast("error", "已有文件传输正在进行");
        return;
      }

      operationBusyRef.current = true;
      setOperationBusy(true);
      dispatch({
        type: "transfer-start",
        serial,
        kind: "upload",
        items: paths.map((path) => ({ sourcePath: path, name: localFileName(path) })),
      });

      let successCount = 0;
      let failureCount = 0;
      try {
        for (let index = 0; index < paths.length; index += 1) {
          if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
            break;
          }
          dispatch({ type: "transfer-item-active", serial, index });
          try {
            const result = await uploadDeviceFile(serial, paths[index], remoteDir);
            if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
              break;
            }
            successCount += 1;
            dispatch({
              type: "transfer-item-success",
              serial,
              index,
              resultName: result.name,
              targetPath: result.remote_path,
            });
          } catch (error) {
            if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
              break;
            }
            failureCount += 1;
            dispatch({
              type: "transfer-item-error",
              serial,
              index,
              error: errorMessage(error),
            });
          }
        }
        if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
          return;
        }
        dispatch({ type: "transfer-finish", serial });
        await loadDirectory(serial, remoteDir);
        if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
          return;
        }
        showToast(
          failureCount === 0 ? "success" : "error",
          failureCount === 0
            ? `已上传 ${successCount} 个文件`
            : `上传完成: ${successCount} 个成功, ${failureCount} 个失败`,
        );
      } finally {
        if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
          operationBusyRef.current = false;
          setOperationBusy(false);
        }
      }
    },
    [
      folderBusy,
      folderDialogOpen,
      loadDirectory,
      showToast,
      state.listLoading,
      state.path,
      state.serial,
    ],
  );

  const dragDropEnabled =
    active &&
    Boolean(onlineSerial) &&
    state.serial === onlineSerial &&
    Boolean(state.path) &&
    !folderDialogOpen &&
    !folderBusy &&
    !state.listLoading;
  const dragDropContextRef = useRef({ enabled: dragDropEnabled, startUpload });
  dragDropContextRef.current = { enabled: dragDropEnabled, startUpload };

  useEffect(() => {
    if (!dragDropEnabled) {
      setDragActive(false);
    }
  }, [dragDropEnabled]);

  useEffect(() => {
    if (!active || !isTauriRuntime()) {
      setDragActive(false);
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    onDragDrop((event) => {
      if (disposed) {
        return;
      }
      if (event.type === "leave" || event.type === "drop") {
        setDragActive(false);
      }
      const dragDropContext = dragDropContextRef.current;
      if (!dragDropContext.enabled || operationBusyRef.current) {
        return;
      }
      if (event.type === "enter") {
        setDragActive(event.paths.length > 0);
      } else if (event.type === "drop") {
        void dragDropContext.startUpload(event.paths);
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch((error) => {
        if (!disposed && activeRef.current) {
          showToast("error", `拖拽监听启动失败: ${errorMessage(error)}`);
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [active, showToast]);

  async function handlePickUpload() {
    const operationContext = operationContextRef.current;
    try {
      const paths = await pickDeviceUploadFiles();
      if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        return;
      }
      await startUpload(paths, operationContext);
    } catch (error) {
      if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        showToast("error", `选择上传文件失败: ${errorMessage(error)}`);
      }
    }
  }

  async function handleDownload(entry: DeviceFileEntry) {
    const operationContext = operationContextRef.current;
    const serial = operationContext.serial;
    if (
      !serial ||
      !isDeviceOperationContextCurrent(operationContextRef.current, operationContext) ||
      state.serial !== serial ||
      entry.kind !== "file"
    ) {
      return;
    }
    if (operationBusyRef.current) {
      showToast("error", "已有文件传输正在进行");
      return;
    }

    try {
      const localPath = await pickDeviceDownloadPath(entry.name);
      if (!localPath) {
        return;
      }
      if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        return;
      }
      if (operationBusyRef.current) {
        showToast("error", "已有文件传输正在进行");
        return;
      }

      operationBusyRef.current = true;
      setOperationBusy(true);
      dispatch({
        type: "transfer-start",
        serial,
        kind: "download",
        items: [{ sourcePath: entry.path, name: entry.name }],
      });
      dispatch({ type: "transfer-item-active", serial, index: 0 });
      try {
        const result = await downloadDeviceFile(serial, entry.path, localPath);
        if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
          return;
        }
        dispatch({
          type: "transfer-item-success",
          serial,
          index: 0,
          resultName: result.name,
          targetPath: result.local_path ?? localPath,
        });
        showToast("success", `文件已保存到 ${result.local_path ?? localPath}`);
      } catch (error) {
        if (!isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
          return;
        }
        const message = errorMessage(error);
        dispatch({ type: "transfer-item-error", serial, index: 0, error: message });
        showToast("error", `下载文件失败: ${message}`);
      } finally {
        if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
          dispatch({ type: "transfer-finish", serial });
          operationBusyRef.current = false;
          setOperationBusy(false);
        }
      }
    } catch (error) {
      if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        showToast("error", `选择保存位置失败: ${errorMessage(error)}`);
      }
    }
  }

  function handleSelectEntry(entry: DeviceFileEntry) {
    if (entry.path === state.selectedPath) {
      return;
    }
    dispatch({ type: "select", path: entry.path });
    if (onlineSerial && entry.kind === "file" && entry.previewable) {
      void loadPreview(onlineSerial, entry);
    }
  }

  async function handleCopyPath(path: string) {
    if (!path) {
      return;
    }
    try {
      await navigator.clipboard.writeText(path);
      showToast("success", "路径已复制");
    } catch (error) {
      showToast("error", `复制路径失败: ${errorMessage(error)}`);
    }
  }

  async function handleCreateDirectory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const operationContext = operationContextRef.current;
    const serial = operationContext.serial;
    const parentPath = state.path;
    const name = folderName.trim();
    if (
      !serial ||
      !isDeviceOperationContextCurrent(operationContextRef.current, operationContext) ||
      state.serial !== serial ||
      !parentPath ||
      !name ||
      folderBusy ||
      operationBusyRef.current ||
      state.listLoading
    ) {
      return;
    }

    operationBusyRef.current = true;
    setFolderBusy(true);
    setFolderError("");
    try {
      await createDeviceDirectory(serial, parentPath, name);
      if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        setFolderDialogOpen(false);
        setFolderName("");
        showToast("success", `已新建目录 ${name}`);
        await loadDirectory(serial, parentPath);
      }
    } catch (error) {
      const message = errorMessage(error);
      if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        setFolderError(message);
        showToast("error", `新建目录失败: ${message}`);
      }
    } finally {
      if (isDeviceOperationContextCurrent(operationContextRef.current, operationContext)) {
        operationBusyRef.current = false;
        setFolderBusy(false);
      }
    }
  }

  async function handleReveal(path: string) {
    try {
      await revealFile(path);
    } catch (error) {
      showToast("error", `无法在文件管理器中显示文件: ${errorMessage(error)}`);
    }
  }

  function handlePathSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onlineSerial && state.serial === onlineSerial && state.pathDraft) {
      void loadDirectory(onlineSerial, state.pathDraft);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex h-[43px] shrink-0 items-center gap-2 border-b border-rule bg-surface px-3">
        <button
          type="button"
          onClick={() => onlineSerial && void loadDirectory(onlineSerial, null)}
          disabled={!onlineSerial || operationBusy || transferBusy || folderBusy}
          className={iconButtonClass}
          title="返回设备下载目录"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onlineSerial && state.parent && void loadDirectory(onlineSerial, state.parent)}
          disabled={controlsDisabled || !state.parent}
          className={iconButtonClass}
          title="返回上级目录"
        >
          <ArrowUp className="h-4 w-4" />
        </button>

        <form onSubmit={handlePathSubmit} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            value={contextMatches ? state.pathDraft : ""}
            onChange={(event) => dispatch({ type: "set-path-draft", value: event.target.value })}
            disabled={!onlineSerial || operationBusy || transferBusy || folderBusy}
            placeholder={onlineSerial ? "正在读取设备下载目录..." : "连接设备后可浏览文件"}
            aria-label="设备绝对路径"
            className="h-8 min-w-0 flex-1 border border-rule bg-paper px-3 font-data text-[11.5px] text-ink outline-none placeholder:text-ink3 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleCopyPath(visiblePath)}
            disabled={!visiblePath}
            className={iconButtonClass}
            title="复制当前路径"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={
              !onlineSerial ||
              state.serial !== onlineSerial ||
              !state.pathDraft ||
              operationBusy ||
              transferBusy ||
              folderBusy
            }
            className={iconButtonClass}
            title="前往路径"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <button
          type="button"
          onClick={() => onlineSerial && state.path && void loadDirectory(onlineSerial, state.path)}
          disabled={controlsDisabled || state.listLoading}
          className={iconButtonClass}
          title="刷新目录"
        >
          <RefreshCw className={cn("h-4 w-4", state.listLoading && "animate-spin")} />
        </button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-dashed border-rule bg-surface2 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto font-data text-[10.5px]">
          {breadcrumbs.length > 0 ? (
            breadcrumbs.map((breadcrumb, index) => (
              <div key={breadcrumb.path} className="flex shrink-0 items-center gap-1">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink3" />}
                <button
                  type="button"
                  onClick={() => onlineSerial && void loadDirectory(onlineSerial, breadcrumb.path)}
                  disabled={
                    operationBusy || transferBusy || folderBusy || breadcrumb.path === visiblePath
                  }
                  className="px-1 py-0.5 text-ink2 hover:bg-hover hover:text-ink disabled:text-ink"
                >
                  {breadcrumb.label}
                </button>
              </div>
            ))
          ) : (
            <span className="text-ink3">设备文件</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setFolderDialogOpen(true);
            setFolderName("");
            setFolderError("");
          }}
          disabled={controlsDisabled}
          className={commandButtonClass}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span className="hidden min-[1040px]:inline">新建目录</span>
        </button>
        <button
          type="button"
          onClick={() => void handlePickUpload()}
          disabled={controlsDisabled}
          className="inline-flex h-7 items-center gap-1.5 border border-ink bg-ink px-2 font-data text-[10.5px] font-medium text-onink hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden min-[1040px]:inline">上传文件</span>
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(260px,3fr)]">
        <DeviceFileList
          directoryPath={visiblePath}
          entries={visibleEntries}
          selectedPath={contextMatches ? state.selectedPath : null}
          loading={directoryLoading}
          loaded={directoryLoaded}
          error={contextMatches ? state.listError : ""}
          online={Boolean(onlineSerial)}
          disabled={operationBusy || transferBusy || folderBusy || state.listLoading}
          dragActive={dragActive && dragDropEnabled}
          onSelect={handleSelectEntry}
          onOpenDirectory={(entry) => onlineSerial && void loadDirectory(onlineSerial, entry.path)}
        />
        <aside className="flex min-h-0 flex-col border-l border-rule bg-surface2">
          <DeviceFileDetails
            entry={selectedEntry}
            preview={state.preview}
            disabled={controlsDisabled}
            onCopyPath={handleCopyPath}
            onDownload={handleDownload}
            onOpenDirectory={(entry) => onlineSerial && void loadDirectory(onlineSerial, entry.path)}
          />
          <TransferPanel transfer={visibleTransfer} onReveal={handleReveal} />
        </aside>
      </div>

      {folderDialogOpen && contextMatches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void handleCreateDirectory(event)}
            className="w-full max-w-sm border border-rule bg-paper p-0 text-ink shadow-[3px_3px_0_var(--color-hard-shadow)]"
          >
            <div className="flex h-10 items-center justify-between gap-3 border-b border-rule bg-surface px-3">
              <h2 className="text-sm font-semibold text-ink">新建目录</h2>
              <button
                type="button"
                onClick={() => setFolderDialogOpen(false)}
                disabled={folderBusy}
                className={iconButtonClass}
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <div className="break-all font-data text-[10.5px] text-ink3">{state.path}</div>
              <input
                autoFocus
                value={folderName}
                onChange={(event) => {
                  setFolderName(event.target.value);
                  setFolderError("");
                }}
                disabled={folderBusy || operationBusy || transferBusy}
                placeholder="目录名称"
                aria-label="新目录名称"
                className="mt-3 h-8 w-full border border-rule bg-paper px-3 text-xs text-ink outline-none placeholder:text-ink3 disabled:opacity-60"
              />
              <div className="mt-2 min-h-5 text-xs text-err">{folderError}</div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFolderDialogOpen(false)}
                  disabled={folderBusy}
                  className={commandButtonClass}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={
                    !folderName.trim() ||
                    folderBusy ||
                    operationBusy ||
                    transferBusy ||
                    state.listLoading
                  }
                  className="inline-flex h-8 items-center gap-2 border border-ink bg-ink px-3 font-data text-[11px] font-medium text-onink hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {folderBusy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderPlus className="h-4 w-4" />
                  )}
                  创建
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

interface DeviceFileListProps {
  directoryPath: string;
  entries: DeviceFileEntry[];
  selectedPath: string | null;
  loading: boolean;
  loaded: boolean;
  error: string;
  online: boolean;
  disabled: boolean;
  dragActive: boolean;
  onSelect: (entry: DeviceFileEntry) => void;
  onOpenDirectory: (entry: DeviceFileEntry) => void;
}

function DeviceFileList({
  directoryPath,
  entries,
  selectedPath,
  loading,
  loaded,
  error,
  online,
  disabled,
  dragActive,
  onSelect,
  onOpenDirectory,
}: DeviceFileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });

  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [directoryPath]);

  return (
    <div className={cn("relative flex min-h-0 flex-col bg-log-bg/45", dragActive && "bg-hover")}>
      <div className="grid h-8 shrink-0 grid-cols-[minmax(140px,1fr)_64px_72px_116px] items-center border-b border-rule bg-surface px-3 font-data text-[10px] font-medium text-ink3">
        <span>名称</span>
        <span>类型</span>
        <span className="text-right">大小</span>
        <span className="text-right">修改时间</span>
      </div>
      {error && (
        <div className="border-b border-err bg-err-band px-3 py-2 text-xs text-err">
          {error}
        </div>
      )}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            const selected = entry.path === selectedPath;
            return (
              <button
                key={entry.path}
                type="button"
                aria-selected={selected}
                onClick={() => onSelect(entry)}
                onDoubleClick={() => entry.kind === "directory" && onOpenDirectory(entry)}
                disabled={disabled}
                title={entry.path}
                className={cn(
                  "absolute left-0 top-0 grid w-full grid-cols-[minmax(140px,1fr)_64px_72px_116px] items-center border-b border-dashed border-rule2 px-3 text-left text-[11.5px] hover:bg-hover disabled:cursor-not-allowed",
                  selected && "bg-hover before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:bg-note",
                )}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DeviceEntryIcon entry={entry} />
                  <span className="truncate font-medium text-ink">{entry.name}</span>
                </span>
                <span className="truncate text-ink3">{deviceFileTypeLabel(entry)}</span>
                <span className="text-right font-data text-ink2">
                  {entry.kind === "directory" ? "-" : formatDeviceFileSize(entry.size)}
                </span>
                <span className="text-right font-data text-ink3">
                  {formatDeviceModifiedAt(entry.modified_at)}
                </span>
              </button>
            );
          })}
        </div>

        {!online && (
          <CenteredState icon={<FolderOpen className="h-8 w-8" />} text="先选择一台在线设备" />
        )}
        {online && loaded && !loading && entries.length === 0 && !error && (
          <CenteredState icon={<Folder className="h-8 w-8" />} text="此目录为空" />
        )}
        {loading && entries.length === 0 && (
          <CenteredState
            icon={<LoaderCircle className="h-8 w-8 animate-spin" />}
            text="正在读取设备目录"
          />
        )}
      </div>
      {dragActive && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center border-2 border-dashed border-note bg-paper/95 text-sm font-medium text-note">
          释放以上传到当前目录
        </div>
      )}
    </div>
  );
}

function CenteredState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink3">
      {icon}
      <span className="text-xs">{text}</span>
    </div>
  );
}

function DeviceEntryIcon({ entry }: { entry: DeviceFileEntry }) {
  if (entry.kind === "directory") {
    return <Folder className="h-4 w-4 shrink-0 text-note" />;
  }
  if (entry.kind === "symlink") {
    return <Link className="h-4 w-4 shrink-0 text-ink3" />;
  }
  if (entry.previewable) {
    return <FileImage className="h-4 w-4 shrink-0 text-ok" />;
  }
  return <File className="h-4 w-4 shrink-0 text-ink3" />;
}

interface DeviceFileDetailsProps {
  entry: DeviceFileEntry | null;
  preview: {
    loading: boolean;
    data: { data_url: string } | null;
    error: string;
  };
  disabled: boolean;
  onCopyPath: (path: string) => Promise<void>;
  onDownload: (entry: DeviceFileEntry) => Promise<void>;
  onOpenDirectory: (entry: DeviceFileEntry) => void;
}

function DeviceFileDetails({
  entry,
  preview,
  disabled,
  onCopyPath,
  onDownload,
  onOpenDirectory,
}: DeviceFileDetailsProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
      {!entry ? (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 text-ink3">
          <File className="h-6 w-6" />
          <strong className="text-sm font-semibold text-ink">未选择项目</strong>
          <span className="text-xs">从左侧选择文件或目录.</span>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-start gap-2">
            <DeviceEntryIcon entry={entry} />
            <div className="min-w-0 flex-1">
              <h2 className="break-all text-sm font-semibold text-ink">{entry.name}</h2>
              <div className="mt-1 font-data text-[10.5px] text-ink3">{deviceFileTypeLabel(entry)}</div>
            </div>
          </div>

          <div className="mt-3 flex min-h-40 flex-1 items-center justify-center overflow-hidden border-y border-dashed border-rule py-3">
            {preview.loading ? (
              <LoaderCircle className="h-7 w-7 animate-spin text-ink3" />
            ) : preview.data ? (
              <img
                src={preview.data.data_url}
                alt={entry.name}
                className="max-h-full max-w-full object-contain"
              />
            ) : entry.kind === "directory" ? (
              <Folder className="h-14 w-14 text-note" />
            ) : entry.previewable ? (
              <div className="px-4 text-center text-xs text-ink3">
                {preview.error || "图片预览不可用"}
              </div>
            ) : (
              <File className="h-14 w-14 text-ink3" />
            )}
          </div>

          <dl className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 font-data text-[10.5px]">
            <dt className="text-ink3">大小</dt>
            <dd className="m-0 text-ink">{entry.kind === "directory" ? "-" : formatDeviceFileSize(entry.size)}</dd>
            <dt className="text-ink3">修改时间</dt>
            <dd className="m-0 text-ink">{formatDeviceModifiedAt(entry.modified_at)}</dd>
            <dt className="text-ink3">路径</dt>
            <dd className="m-0 break-all text-ink2">{entry.path}</dd>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCopyPath(entry.path)}
              className={commandButtonClass}
            >
              <Copy className="h-4 w-4" />
              复制路径
            </button>
            {entry.kind === "directory" ? (
              <button
                type="button"
                onClick={() => onOpenDirectory(entry)}
                disabled={disabled}
                className={commandButtonClass}
              >
                <FolderOpen className="h-4 w-4" />
                打开目录
              </button>
            ) : entry.kind === "file" ? (
              <button
                type="button"
                onClick={() => void onDownload(entry)}
                disabled={disabled}
                className="inline-flex h-8 items-center gap-2 border border-ink bg-ink px-3 font-data text-[11px] font-medium text-onink hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                下载到电脑
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function TransferPanel({
  transfer,
  onReveal,
}: {
  transfer: DeviceTransferBatch | null;
  onReveal: (path: string) => Promise<void>;
}) {
  return (
    <div className="flex max-h-56 min-h-32 flex-col border-t border-rule">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-rule bg-surface px-3 text-xs font-medium">
        <span className="text-ink">最近传输</span>
        {transfer && (
          <span className="font-data text-[10px] text-ink3">{deviceTransferSummary(transfer)}</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!transfer ? (
          <div className="flex h-full items-center justify-center text-xs text-ink3">
            暂无传输记录
          </div>
        ) : (
          transfer.items.map((item, index) => (
            <div key={`${item.sourcePath}-${index}`} className="flex gap-2 border-b border-dashed border-rule2 px-3 py-2 text-xs">
              <TransferStatusIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={item.name}>
                  {item.name}
                </div>
                {item.status === "active" && (
                  <div className="mt-0.5 text-ink3">
                    {transfer.kind === "upload" ? "正在上传" : "正在下载"}
                  </div>
                )}
                {item.status === "success" && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate font-data text-ink3" title={item.targetPath}>
                      {item.targetPath}
                    </span>
                    {transfer.kind === "download" && (
                      <button
                        type="button"
                        onClick={() => void onReveal(item.targetPath)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-rule text-ink3 hover:bg-hover hover:text-ink"
                        title="在文件管理器中显示"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
                {item.status === "error" && (
                  <div className="mt-0.5 break-words text-err">{item.error}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TransferStatusIcon({ status }: { status: DeviceTransferBatch["items"][number]["status"] }) {
  switch (status) {
    case "pending":
      return <span className="mt-1 h-3.5 w-3.5 shrink-0 border border-rule" />;
    case "active":
      return <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-note" />;
    case "success":
      return <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />;
    case "error":
      return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-err" />;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const iconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-rule text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

const commandButtonClass =
  "inline-flex h-7 items-center gap-1.5 border border-rule px-2 font-data text-[10.5px] font-medium text-ink hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40";
