import useAssetStore from "@/stores/asset-store";
import useEventListenerStore from "@/stores/event-listener-store";
import useNavStore from "@/stores/nav-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, ChevronRight, FolderOpen, Image, Loader2, Music, Settings, Video } from "lucide-react";
import { useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";

const sidebarItems = [
  {
    icon: <Music size={14} />,
    label: "Sound",
    path: "/sound",
    type: "sfx",
  },
  {
    icon: <Video size={14} />,
    label: "Video",
    path: "/video",
    type: "video",
  },
  {
    icon: <Image size={14} />,
    label: "Image",
    path: "/image",
    type: "image",
  },
  {
    icon: <FontAwesomeIcon icon={faYoutube} style={{ color: "#ff0000", }} size="sm" className="min-h-0 h-1 max-h-3 p-0 m-0" />,
    label: "Download",
    path: "/youtube-download",
    type: "youtube",
  },
  {
    icon: <Settings size={14} />,
    label: "Settings",
    path: "/settings",
    type: "settings",
  },
];

const Navbar = () => {
  const { activeItem, setActiveItem, isMinimized, toggleMinimized } = useNavStore((state) => state);
  const { setParentPath, sfx, video, image } = useAssetStore((state) => state);
  const { progressSound, progressImage, countingTotal, setCountingTotal } = useEventListenerStore((state) => state);
  const [progressVideo] = useState<any>(null);

  const handleSetPath = async () => {
    try {
      const path = await open({
        directory: true,
      });

      if (path) {
        setCountingTotal(true);
        setParentPath(path);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getCount = (type: string) => {
    if (countingTotal) return null;
    if (type === "sfx") return sfx;
    if (type === "video") return video;
    if (type === "image") return image;
    return null;
  };

  return (
    <aside
      className={`flex flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 border-r border-sidebar-border ${isMinimized ? "w-[44px]" : "w-[164px]"}`}
    >
      {/* Header / App chrome (Premiere-ish) */}
      <div className="h-10 px-2 flex items-center gap-2 select-none">
        {!isMinimized && (
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
              Project
            </div>
            <div className="text-xs font-medium leading-tight truncate">Editon</div>
          </div>
        )}

        <Button
          onClick={toggleMinimized}
          variant="ghost"
          size="icon-xs"
          className="ml-auto rounded-sm hover:bg-sidebar-accent/40 active:bg-sidebar-accent/60"
          aria-label={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
          title={isMinimized ? "Expand" : "Minimize"}
        >
          {isMinimized ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </Button>
      </div>

      {/* Section label */}
      {!isMinimized && (
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Panels
        </div>
      )}

      {/* Items */}
      <nav className="flex-1 px-1 pb-2 select-none overflow-y-auto">
        {sidebarItems.map((item) => {
          const isActive = activeItem === item.path;
          const count = getCount(item.type);

          return (
            <div
              key={item.path}
              role="button"
              tabIndex={0}
              onClick={() => setActiveItem(item.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setActiveItem(item.path);
              }}
              title={isMinimized ? item.label : undefined}
              className={
                `group relative flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm ` +
                `hover:bg-sidebar-accent/35 active:bg-sidebar-accent/50 ` +
                (isActive ? "bg-sidebar-accent/45" : "") +
                (isMinimized ? " justify-center" : "")
              }
            >
              {/* Active indicator bar */}
              <div
                className={
                  "absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm " +
                  (isActive ? "bg-primary" : "bg-transparent group-hover:bg-primary/40")
                }
              />

              <div className={`max-h-5 flex justify-center items-center ${isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                {item.icon}
              </div>

              {
                !isMinimized && (
                  <div className="flex items-center justify-between w-full min-w-0">
                    <span className={"text-xs truncate " + (isActive ? "text-foreground" : "text-sidebar-foreground")}>
                      {item.label}
                    </span>

                    <span className="ml-2 text-[10px] text-muted-foreground flex items-center">
                      {countingTotal ? (
                        <Loader2 className="animate-spin" size={12} />
                      ) : count !== null ? (
                        <span className="px-1.5 py-0.5 rounded-sm bg-muted/30 border border-border">
                          {count}
                        </span>
                      ) : null}
                </span>
              </div>
                )
              }
            </div>
          );
        })}
      </nav>

      {/* Bottom dock: progress + toolbar */}
      <div className="border-t border-sidebar-border">
        {!isMinimized && (progressSound || progressVideo || progressImage) && (
          <div className="animate-in slide-in-from-bottom-2 fade-in duration-200 p-2">
            <div className="bg-card/40 border border-border rounded-sm p-2 space-y-1">
              <div className="text-[11px] font-semibold">Background tasks</div>

              <div className="flex flex-col text-[10px] text-muted-foreground truncate">
                {progressSound && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{progressSound?.name?.toString()}</span>
                    <span className="shrink-0">{progressSound?.current} / {progressSound?.total}</span>
                  </div>
                )}
                {progressVideo && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{progressVideo?.name?.toString()}</span>
                    <span className="shrink-0">{progressVideo?.current} / {progressVideo?.total}</span>
              </div>
                )}
                {progressImage && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{progressImage?.name?.toString()}</span>
                    <span className="shrink-0">{progressImage?.current} / {progressImage?.total}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`p-2 flex gap-2 ${isMinimized ? "flex-col items-center" : "items-center justify-between"}`}>
          <ModeToggle />

          {!isMinimized ? (
            <Button
              onClick={handleSetPath}
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs rounded-sm"
              title="Import media folder"
            >
              <FolderOpen size={14} />
              Import
            </Button>
          ) : (
            <Button
              onClick={handleSetPath}
              variant="outline"
              size="icon-xs"
              title="Import media folder"
              className="rounded-sm"
            >
              <FolderOpen size={14} />
            </Button>
          )}
        </div>
      </div>
    </aside >
  );
};

export default Navbar;
