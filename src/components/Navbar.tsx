import useAssetStore from "@/stores/asset-store";
import useEventListenerStore from "@/stores/event-listener-store";
import useNavStore from "@/stores/nav-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, ChevronRight, Folder, FolderOpen, Image, Loader2, Music, Settings, Video } from "lucide-react";
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
    icon: <FontAwesomeIcon icon={faYoutube} style={{ color: "#ff0000", }} />,
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


  return (
    <div className={`flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ${isMinimized ? 'w-[48px]' : 'w-[148px]'}`}>
      <div className="flex items-center justify-between h-8 pt-1 px-1.5">
        {!isMinimized && <h3 className="text-xs font-medium select-none">Editon</h3>}
        <button
          onClick={toggleMinimized}
          className="p-0.5 rounded-sm hover:bg-sidebar-accent/50 transition-colors ml-auto"
          aria-label={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
        >
          {isMinimized ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      <div className="mt-1 gap-0.5 flex flex-col h-screen px-1.5 select-none">
        {sidebarItems.map((item) => (
          <div
            key={item.path}
            className={`flex items-center gap-1.5 px-1.5 py-1 rounded-sm cursor-pointer hover:bg-sidebar-accent/50 ${activeItem === item.path ? "bg-sidebar-accent" : ""
              } ${isMinimized ? 'justify-center' : ''}`}
            onClick={() => setActiveItem(item.path)}
            title={isMinimized ? item.label : undefined}
          >
            {item.icon}
            {!isMinimized && (
              <div className="flex justify-between w-full">
                <span className="text-xs">{item.label}</span>
                <span className="text-[10px] text-muted-foreground flex items-center">
                  {!countingTotal ? item.type === "sfx" ? sfx : item.type === "video" ? video : item.type === "image" ? image : null : <Loader2 className="animate-spin" size={12} />}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 mb-2">
        {!isMinimized && (progressSound || progressVideo || progressImage) && (
          <div className="col-span-2 animate-in slide-in-from-bottom-2 fade-in duration-300 p-1.5">
            <div className="bg-card border rounded-sm p-1.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold">Optimizing...</h4>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-col justify-between text-[10px] text-muted-foreground truncate">
                {progressSound &&
                  <div className="flex justify-between">
                    {progressSound?.name?.toString()}
                    <span>{progressSound?.current} / {progressSound?.total}</span>
                  </div>}
                {progressVideo &&
                  <div className="flex justify-between">
                    {progressVideo?.name.toString()}
                    <span>{progressVideo?.current} / {progressVideo?.total}</span>
                  </div>}
                {progressImage &&
                  <div className="flex justify-between">
                    {progressImage?.name?.toString()}
                    <span>{progressImage?.current} / {progressImage?.total}</span>
                  </div>
                }
              </div>
            </div>
          </div>
        )}
        <div className={`p-1.5 flex gap-1 col-span-2 ${isMinimized ? 'flex-col items-center' : 'justify-center'}`}>
          <ModeToggle />
          {!isMinimized && (
            <Button
              onClick={() => handleSetPath()}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
            >
              <FolderOpen /> Import
            </Button>
          )}
          {isMinimized && (
            <Button
              onClick={() => handleSetPath()}
              variant="outline"
              size="icon"
              title="Scan Folder"
              className="h-6 w-6"
            >
              <FolderOpen size={14} />
            </Button>
          )}
        </div>

      </div>
    </div>
  );
};

export default Navbar;
