import { Button } from "@/components/ui/button";
import { PageHeader, PageLayout } from "@/components/shell/page-layout";
import type { AppUpdaterStatus } from "@/features/app-updates/hooks/use-app-updater";
import { AlertCircle, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

type SettingsPageProps = {
  update: {
    updateAvailable: boolean;
    appVersion: string;
    lastCheckedAt: string | null;
    isCheckingUpdates: boolean;
    isInstallingUpdate: boolean;
    status: AppUpdaterStatus;
    lastError: string | null;
  };
  onCheckForUpdates: () => Promise<boolean>;
  onInstallUpdate: () => Promise<void>;
};

const SettingsPage = ({
  update,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsPageProps) => {
  const {
    updateAvailable,
    appVersion,
    lastCheckedAt,
    isCheckingUpdates,
    isInstallingUpdate,
    status,
    lastError,
  } = update;
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formattedCheckedAt = useMemo(() => {
    if (!lastCheckedAt) return "Not checked yet";
    return new Date(lastCheckedAt).toLocaleString();
  }, [lastCheckedAt]);

  const handleCheckUpdates = async () => {
    const hasUpdate = await onCheckForUpdates();
    setStatusMessage(hasUpdate ? "Update available." : "You're up to date.");
  };

  const statusLabel = useMemo(() => {
    if (lastError) {
      return "Error";
    }

    switch (status) {
      case "checking":
        return "Checking";
      case "available":
        return "Update available";
      case "installing":
        return "Installing";
      case "up-to-date":
        return "Up to date";
      default:
        return "Idle";
    }
  }, [lastError, status]);

  const statusClass = useMemo(() => {
    if (lastError) {
      return "border-destructive/30 bg-destructive/10 text-destructive";
    }

    if (updateAvailable || status === "available") {
      return "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400";
    }

    if (isCheckingUpdates || isInstallingUpdate) {
      return "border-primary/30 bg-primary/10 text-primary";
    }

    return "border-border bg-muted/40 text-muted-foreground";
  }, [
    isCheckingUpdates,
    isInstallingUpdate,
    lastError,
    status,
    updateAvailable,
  ]);

  return (
    <PageLayout>
      <PageHeader
        title="Settings"
        subtitle="Update status and controls"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckUpdates}
            loading={isCheckingUpdates}
          >
            <RefreshCw className="h-4 w-4" />
            Check
          </Button>
        }
      />

      <section
        className="rounded-xl border bg-card p-4"
        data-testid="settings-updates-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">App updates</h2>
            <p className="text-xs text-muted-foreground">
              Version {appVersion}
            </p>
            <p className="text-xs text-muted-foreground">
              Last checked {formattedCheckedAt}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium ${statusClass}`}
            data-testid="settings-update-status"
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {updateAvailable && (
            <Button
              size="sm"
              onClick={onInstallUpdate}
              loading={isInstallingUpdate}
            >
              <Download className="h-4 w-4" />
              Install update
            </Button>
          )}

          {statusMessage ? (
            <span className="text-xs text-muted-foreground">
              {statusMessage}
            </span>
          ) : null}

          {lastError ? (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {lastError}
            </span>
          ) : null}
        </div>
      </section>
    </PageLayout>
  );
};

export default SettingsPage;
