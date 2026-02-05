import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

type SettingsPageProps = {
  update: {
    updateAvailable: boolean;
    appVersion: string;
    lastCheckedAt: string | null;
    isCheckingUpdates: boolean;
    isInstallingUpdate: boolean;
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

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-xs text-muted-foreground">
            Manage app preferences and updates.
          </p>
        </div>
      </div>

      <div className="border rounded-xl p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">App Updates</h3>
            <p className="text-xs text-muted-foreground">
              Version {appVersion}
            </p>
            <p className="text-xs text-muted-foreground">
              Last checked: {formattedCheckedAt}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckUpdates}
              loading={isCheckingUpdates}
            >
              <RefreshCw className="h-4 w-4" />
              Check for updates
            </Button>
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
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2.5 w-2.5 rounded-full ${updateAvailable ? "bg-green-500" : "bg-muted-foreground"}`}
          />
          <span className="text-muted-foreground">
            {updateAvailable ? "Update available" : "Up to date"}
          </span>
          {statusMessage && (
            <span className="text-muted-foreground">• {statusMessage}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
