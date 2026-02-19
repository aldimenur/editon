import { cn } from "@/lib/utils";
import { isTauriRuntime } from "@/lib/runtime";
import type { Window } from "@tauri-apps/api/window";
import {
  Focus,
  Minus,
  Pin,
  PinOff,
  Square,
  SquaresExclude,
  X,
} from "lucide-react";

type TitleBarProps = {
  window: {
    isMaximized: boolean;
    isAlwaysOnTop: boolean;
    appWindow: Window | null;
    setIsAlwaysOnTop: (value: boolean) => void;
    setIsMaximized: (value: boolean) => void;
  };
  isZenMode: boolean;
  onToggleZen: () => void;
};

const TitleBar = ({ window, isZenMode, onToggleZen }: TitleBarProps) => {
  const {
    isMaximized,
    isAlwaysOnTop,
    appWindow,
    setIsAlwaysOnTop,
    setIsMaximized,
  } = window;
  const inTauri = isTauriRuntime();

  return (
    <div
      className={cn("flex items-center gap-1 w-full h-8 select-none")}
      data-tauri-drag-region
      data-testid="titlebar"
    >
      <div className="flex items-center gap-1 p-1 pointer-events-auto">
        <button
          onClick={onToggleZen}
          className="hover:bg-sidebar-accent/50 rounded-md px-2 py-1 text-[11px] cursor-pointer transition-colors flex items-center gap-1"
          title={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
          data-testid="zen-toggle"
        >
          {isZenMode ? (
            <>
              <X size={12} />
              Exit Zen
            </>
          ) : (
            <>
              <Focus size={12} />
              Zen
            </>
          )}
        </button>
      </div>
      <div className="flex-1 pointer-events-none"></div>
      {!isZenMode && (
        <div className="flex items-center gap-1 p-1 pointer-events-auto">
          <button
            onClick={async () => {
              if (!inTauri || !appWindow) return;
              const newState = !isAlwaysOnTop;
              await appWindow.setAlwaysOnTop(newState);
              setIsAlwaysOnTop(newState);
            }}
            className={cn(
              "rounded-md p-1 transition-colors",
              inTauri
                ? "cursor-pointer hover:bg-sidebar-accent/50"
                : "cursor-not-allowed opacity-40",
              isAlwaysOnTop && "bg-sidebar-accent/70",
            )}
            title={
              isAlwaysOnTop ? "Disable Always on Top" : "Enable Always on Top"
            }
            disabled={!inTauri}
          >
            {isAlwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={() => {
              if (!inTauri || !appWindow) return;
              appWindow.minimize();
            }}
            className={cn(
              "rounded-md p-1 transition-colors",
              inTauri
                ? "cursor-pointer hover:bg-sidebar-accent/50"
                : "cursor-not-allowed opacity-40",
            )}
            disabled={!inTauri}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => {
              if (!inTauri || !appWindow) return;
              if (isMaximized) {
                appWindow.unmaximize();
                setIsMaximized(false);
              } else {
                appWindow.maximize();
                setIsMaximized(true);
              }
            }}
            className={cn(
              "rounded-md p-1 transition-colors",
              inTauri
                ? "cursor-pointer hover:bg-sidebar-accent/50"
                : "cursor-not-allowed opacity-40",
            )}
            disabled={!inTauri}
          >
            {!isMaximized ? <Square size={12} /> : <SquaresExclude size={12} />}
          </button>
          <button
            onClick={() => {
              if (!inTauri || !appWindow) return;
              appWindow.close();
            }}
            className={cn(
              "rounded-md p-1 transition-colors",
              inTauri
                ? "cursor-pointer hover:bg-sidebar-accent/50"
                : "cursor-not-allowed opacity-40",
            )}
            disabled={!inTauri}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;
