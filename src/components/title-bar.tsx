import { cn } from "@/lib/utils";
import { Window } from "@tauri-apps/api/window";
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
    appWindow: Window;
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

  return (
    <div
      className={cn("flex items-center gap-1 w-full h-8 select-none")}
      data-tauri-drag-region
    >
      <div className="flex items-center gap-1 p-1 pointer-events-auto">
        <button
          onClick={onToggleZen}
          className="hover:bg-sidebar-accent/50 rounded-md px-2 py-1 text-[11px] cursor-pointer transition-colors flex items-center gap-1"
          title={isZenMode ? "Exit Zen Mode" : "Enter Zen Mode"}
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
              const newState = !isAlwaysOnTop;
              await appWindow.setAlwaysOnTop(newState);
              setIsAlwaysOnTop(newState);
            }}
            className={cn(
              "hover:bg-sidebar-accent/50 rounded-md p-1 cursor-pointer transition-colors",
              isAlwaysOnTop && "bg-sidebar-accent/70",
            )}
            title={
              isAlwaysOnTop ? "Disable Always on Top" : "Enable Always on Top"
            }
          >
            {isAlwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            onClick={() => appWindow.minimize()}
            className="hover:bg-sidebar-accent/50 rounded-md p-1 cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => {
              if (isMaximized) {
                appWindow.unmaximize();
                setIsMaximized(false);
              } else {
                appWindow.maximize();
                setIsMaximized(true);
              }
            }}
            className="hover:bg-sidebar-accent/50 rounded-md p-1 cursor-pointer"
          >
            {!isMaximized ? <Square size={12} /> : <SquaresExclude size={12} />}
          </button>
          <button
            onClick={() => appWindow.close()}
            className="hover:bg-sidebar-accent/50 rounded-md p-1 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;
