import { cn } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, SquaresExclude, X } from "lucide-react";
import { useEffect, useState } from "react";

const TitleBar = ({ className }: { className?: string }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const appWindow = getCurrentWindow();

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
  }, [appWindow]);

  return (
    <div
      className={cn("flex items-center gap-1 w-full h-8 select-none", className)}
      data-tauri-drag-region
    >
      <div className="flex-1 pointer-events-none"></div>
      <div className="flex items-center gap-1 p-1 pointer-events-auto">
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
    </div>
  );
};

export default TitleBar;
