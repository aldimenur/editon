import useAssetStore from "@/stores/asset-store";
import useEventListenerStore from "@/stores/event-listener-store";
import useNavStore from "@/stores/nav-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { open } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { ChevronLeft, ChevronRight, Download, Image, Loader2, Music, Video } from "lucide-react";
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
  }
];

const Navbar = (params: any) => {
  const { updateAvailable, appVersion } = params.update
  const { activeItem, setActiveItem, isMinimized, toggleMinimized } = useNavStore((state) => state);
  const { setParentPath, sfx, video, image } = useAssetStore((state) => state);
  const { progressSound, progressImage, countingTotal, setCountingTotal } = useEventListenerStore((state) => state);
  const [progressVideo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>();

  const handleUpdate = async () => {
    setIsLoading(true);
    const update = await check();
    if (update) {
      await update.download();
      await update.install();
      window.location.reload();
    }
    setIsLoading(false);
  }

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
    <div className={`flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ${isMinimized ? 'w-[60px]' : 'w-[170px]'}`}>
      <div className="flex items-center justify-between pt-3 px-3">
        {!isMinimized && <h3 className="text-sm font-medium select-none">Editon</h3>}
        <button
          onClick={toggleMinimized}
          className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors ml-auto"
          aria-label={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
        >
          {isMinimized ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className="mt-4 gap-1 flex flex-col h-screen px-3 select-none">
        {sidebarItems.map((item) => (
          <div
            key={item.path}
            className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-sidebar-accent/50 ${activeItem === item.path ? "bg-sidebar-accent" : ""
              } ${isMinimized ? 'justify-center' : ''}`}
            onClick={() => setActiveItem(item.path)}
            title={isMinimized ? item.label : undefined}
          >
            {item.icon}
            {!isMinimized && (
              <div className="flex justify-between w-full">
                <span className="text-sm">{item.label}</span>
                <span className="text-xs text-muted-foreground flex items-center">
                  {!countingTotal ? item.type === "sfx" ? sfx : item.type === "video" ? video : item.type === "image" ? image : null : <Loader2 className="animate-spin" size={12} />}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 mb-2">
        {!isMinimized && (progressSound || progressVideo || progressImage) && (
          <div className="col-span-2 animate-in slide-in-from-bottom-2 fade-in duration-300 p-2">
            <div className="bg-card border rounded-lg shadow-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold">Optimizing...</h4>
                </div>
              </div>

              {/* Stats */}
              <div className="flex flex-col  justify-between text-xs text-muted-foreground truncate">
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
        {!isMinimized && updateAvailable &&
          <div className="flex items-center col-span-2 justify-center m-2 p-2 animate-in slide-in-from-bottom-2 fade-in duration-300 border rounded-xl">
            <span className="text-xs font-bold text-green-500">
              Update available
            </span>
            <Button variant="default" size="sm" onClick={handleUpdate} loading={isLoading}>Update</Button>
          </div>
        }
        {isMinimized && updateAvailable &&
          <div className="col-span-2 flex justify-center">
            <Button variant="default" size="sm" onClick={handleUpdate} loading={isLoading}><Download className="animate-caret-blink" /></Button>
          </div>
        }

        <div className={`p-2 flex gap-2 col-span-2 ${isMinimized ? 'flex-col items-center' : 'justify-center'}`}>
          <ModeToggle />
          {!isMinimized && (
            <Button
              onClick={() => handleSetPath()}
              variant="outline"
              size="default"
            >
              Scan Folder
            </Button>
          )}
          {isMinimized && (
            <Button
              onClick={() => handleSetPath()}
              variant="outline"
              size="icon"
              title="Scan Folder"
            >
              <Music size={16} />
            </Button>
          )}
        </div>

        {!isMinimized && (
          <div className="col-span-2 flex justify-center">
            <span className="text-xs text-accent-foreground">Version {appVersion}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Navbar;
