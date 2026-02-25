import { useEffect } from "react";

import { SystemPanel, useSystemStore } from "@/features/system";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { StatusText } from "@/shared/ui/status-text";

export function SystemPage() {
  const {
    dependencies,
    loading,
    statusMessage,
    error,
    checkDependencies,
    queueInstall,
    queueUpdate,
  } = useSystemStore();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void checkDependencies();
  }, [checkDependencies]);

  return (
    <>
      {error ? <StatusText text={error} isError /> : null}
      <SystemPanel
        dependencies={dependencies}
        loading={loading || !isTauriRuntime()}
        statusMessage={statusMessage}
        onCheck={() => void checkDependencies()}
        onInstall={() => void queueInstall()}
        onUpdate={() => void queueUpdate()}
      />
    </>
  );
}
