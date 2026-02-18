import useAssetStore from "@/stores/asset-store";
import useEventListenerStore from "@/stores/event-listener-store";
import useNavStore, {
  type AppPage,
  type AssetFilter,
} from "@/stores/nav-store";
import type { ProgressPayload } from "@/stores/event-listener-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import {
  faBoxesStacked,
  faCompass,
  faFolderOpen,
  faGear,
  faImage,
  faMusic,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";

type FilterItem = {
  icon: ReactNode;
  label: string;
  filter: AssetFilter;
};

const filterItems: FilterItem[] = [
  {
    icon: <FontAwesomeIcon icon={faCompass} className="text-[12px]" />,
    label: "All",
    filter: "all",
  },
  {
    icon: <FontAwesomeIcon icon={faMusic} className="text-[12px]" />,
    label: "Sound",
    filter: "audio",
  },
  {
    icon: <FontAwesomeIcon icon={faVideo} className="text-[12px]" />,
    label: "Video",
    filter: "video",
  },
  {
    icon: <FontAwesomeIcon icon={faImage} className="text-[12px]" />,
    label: "Image",
    filter: "image",
  },
];

const pageItems: {
  icon: ReactNode;
  label: string;
  page: AppPage;
}[] = [
    {
      icon: (
        <FontAwesomeIcon icon={faYoutube} className="text-[12px] text-red-500" />
      ),
      label: "Download",
      page: "/youtube-download",
    },
    {
      icon: <FontAwesomeIcon icon={faGear} className="text-[12px]" />,
      label: "Settings",
      page: "/settings",
    },
  ];

const Navbar = () => {
  const {
    activePage,
    setActivePage,
    activeAssetFilter,
    setActiveAssetFilter,
    isMinimized,
    toggleMinimized,
  } = useNavStore((state) => state);
  const { setParentPath, sfx, video, image } = useAssetStore((state) => state);
  const { progressSound, progressImage, countingTotal, setCountingTotal } =
    useEventListenerStore((state) => state);
  const progressVideo = null as ProgressPayload | null;

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

  const getCount = (type: AssetFilter) => {
    if (countingTotal) return null;
    if (type === "all") return sfx + video + image;
    if (type === "audio") return sfx;
    if (type === "video") return video;
    if (type === "image") return image;
    return null;
  };

  return (
    <aside
      className={`flex flex-col border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground supports-backdrop-filter:bg-sidebar/80 supports-backdrop-filter:backdrop-blur-xl transition-[width] duration-200 ease-out ${isMinimized ? "w-[58px]" : "w-[220px]"}`}
    >
      <div className="h-11 px-3.5 flex items-center gap-2 border-b border-sidebar-border/90 select-none">
        {!isMinimized && (
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium leading-none truncate tracking-[0.01em]">
              Editon
            </div>
          </div>
        )}

        <Button
          onClick={toggleMinimized}
          variant="ghost"
          size="icon-xs"
          className="ml-auto h-7 w-7 rounded-none border border-transparent hover:border-sidebar-border hover:bg-sidebar-accent/45 active:bg-sidebar-accent/60"
          aria-label={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
          title={isMinimized ? "Expand" : "Minimize"}
        >
          {isMinimized ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </Button>
      </div>

      <nav className="flex-1 py-2 select-none overflow-y-auto">
        {filterItems.map((item) => {
          const isActive =
            activePage === "assets" && activeAssetFilter === item.filter;
          const count = getCount(item.filter);

          return (
            <div
              key={item.filter}
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveAssetFilter(item.filter);
                setActivePage("assets");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setActiveAssetFilter(item.filter);
                  setActivePage("assets");
                }
              }}
              title={isMinimized ? item.label : undefined}
              className={
                `group relative flex h-8 items-center gap-2.5 px-3.5 cursor-pointer border-y border-transparent ` +
                `hover:bg-sidebar-accent/30 hover:border-sidebar-border/50 active:bg-sidebar-accent/45 ` +
                (isActive
                  ? "bg-sidebar-accent/60 border-sidebar-border/80"
                  : "") +
                (isMinimized ? " justify-center" : "")
              }
            >
              <div
                className={
                  `flex h-5 w-5 items-center justify-center shrink-0 ` +
                  (isActive
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground")
                }
              >
                {item.icon}
              </div>

              {!isMinimized && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span
                    className={
                      "text-[12px] truncate " +
                      (isActive ? "text-foreground" : "text-sidebar-foreground")
                    }
                  >
                    {item.label}
                  </span>

                  <span className="ml-2 text-[10px] text-muted-foreground flex items-center">
                    {countingTotal ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : count !== null ? (
                      <span className="px-1.5 py-0.5 bg-muted/30 border border-border/70 rounded-none min-w-5 text-center">
                        {count}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {!isMinimized && (
          <div className="mt-1 text-[10px] tracking-[0.04em] text-muted-foreground border-t border-sidebar-border/80">
          </div>
        )}

        {pageItems.map((item) => {
          const isActive = activePage === item.page;

          return (
            <div
              key={item.page}
              role="button"
              tabIndex={0}
              onClick={() => setActivePage(item.page)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  setActivePage(item.page);
              }}
              title={isMinimized ? item.label : undefined}
              className={
                `group relative flex h-8 items-center gap-2.5 px-3.5 cursor-pointer border-y border-transparent ` +
                `hover:bg-sidebar-accent/30 hover:border-sidebar-border/50 active:bg-sidebar-accent/45 ` +
                (isActive
                  ? "bg-sidebar-accent/60 border-sidebar-border/80"
                  : "") +
                (isMinimized ? " justify-center" : "")
              }
            >
              <div
                className={
                  `flex h-5 w-5 items-center justify-center shrink-0 ` +
                  (isActive
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground")
                }
              >
                {item.icon}
              </div>

              {!isMinimized && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span
                    className={
                      "text-[12px] truncate " +
                      (isActive ? "text-foreground" : "text-sidebar-foreground")
                    }
                  >
                    {item.label}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border/90">
        {!isMinimized && (progressSound || progressVideo || progressImage) && (
          <div className="animate-in slide-in-from-bottom-2 fade-in duration-200 p-2">
            <div className="bg-card/40 border border-border/70 rounded-none p-2 space-y-1">
              <div className="text-[11px] font-semibold">Background tasks</div>

              <div className="flex flex-col text-[10px] text-muted-foreground truncate">
                {progressSound && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      {progressSound?.name?.toString()}
                    </span>
                    <span className="shrink-0">
                      {progressSound?.current} / {progressSound?.total}
                    </span>
                  </div>
                )}
                {progressVideo && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      {progressVideo?.name?.toString()}
                    </span>
                    <span className="shrink-0">
                      {progressVideo?.current} / {progressVideo?.total}
                    </span>
                  </div>
                )}
                {progressImage && (
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      {progressImage?.name?.toString()}
                    </span>
                    <span className="shrink-0">
                      {progressImage?.current} / {progressImage?.total}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div
          className={`p-2 flex gap-2 ${isMinimized ? "flex-col items-center" : "items-center justify-between"}`}
        >
          <ModeToggle />

          {!isMinimized ? (
            <Button
              onClick={handleSetPath}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] rounded-none"
              title="Import media folder"
            >
              <FontAwesomeIcon icon={faFolderOpen} className="text-[12px]" />
              Import
            </Button>
          ) : (
            <Button
              onClick={handleSetPath}
              variant="outline"
              size="icon-xs"
              title="Import media folder"
              className="h-6 w-6 rounded-none"
            >
              <FontAwesomeIcon icon={faFolderOpen} className="text-[12px]" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Navbar;
