import { useEffect } from "react";

import {
  AssetPagination,
  AssetToolbar,
  AssetsTable,
  onScanProgress,
  useAssetsStore,
} from "@/features/assets";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { StatusText } from "@/shared/ui/status-text";

export function BrowserPage() {
  const {
    items,
    page,
    totalPages,
    totalItems,
    rootPath,
    scanId,
    scanProgress,
    scanRoots,
    syncingRootPath,
    removingRootPath,
    loading,
    error,
    setRootPath,
    setScanProgress,
    setError,
    refresh,
    refreshScanRoots,
    beginScan,
    syncRoot,
    removeRoot,
    haltScan,
  } = useAssetsStore();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void refresh(1);
    void refreshScanRoots();

    let unlisten: (() => void) | undefined;
    onScanProgress((payload) => {
      setScanProgress(payload);

      if (payload.status === "done" || payload.status === "cancelled") {
        void refresh(1);
        void refreshScanRoots();
      }
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        setError("Failed to subscribe scan progress events.");
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh, refreshScanRoots, setError, setScanProgress]);

  return (
    <section className="pane">
      <header className="pane-head">
        <h2>Asset Browser</h2>
        <p className="meta">
          {totalItems} items · page {page}/{totalPages}
        </p>
      </header>
      <AssetToolbar
        rootPath={rootPath}
        loading={loading || !isTauriRuntime()}
        canStop={scanId !== null}
        scanRoots={scanRoots}
        syncingRootPath={syncingRootPath}
        removingRootPath={removingRootPath}
        onRootPathChange={setRootPath}
        onBrowsePath={setRootPath}
        onStartScan={() => void beginScan()}
        onSyncRoot={(targetPath) => void syncRoot(targetPath)}
        onRemoveRoot={(targetPath) => void removeRoot(targetPath)}
        onStopScan={() => void haltScan()}
        onReload={() => void refresh(page)}
      />
      {scanProgress ? (
        <StatusText
          text={`scan ${scanProgress.scanId} · ${scanProgress.status} · ${scanProgress.count} files`}
        />
      ) : null}
      {error ? <StatusText text={error} isError /> : null}
      <div className="table-container">
        <AssetsTable items={items} />
      </div>
      <AssetPagination
        page={page}
        totalPages={totalPages}
        loading={loading}
        onFirst={() => void refresh(1)}
        onPrev={() => void refresh(page - 1)}
        onNext={() => void refresh(page + 1)}
        onLast={() => void refresh(totalPages)}
      />
    </section>
  );
}
