import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { open } from "@tauri-apps/plugin-dialog";
import { Image, Loader2, Music, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { check } from "@tauri-apps/plugin-updater";
import { Button } from "./ui/button";
import { getVersion } from "@tauri-apps/api/app";
import { useEventListeners } from "@/hooks/useEventListeners";
import { invoke } from "@tauri-apps/api/core";

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

const Navbar = () => {
  const { activeItem, setActiveItem } = useNavStore((state) => state);
  const { parentPath, setParentPath, sfx, video, image, updateAssetsCount } = useAssetStore((state) => state);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [countingTotal, setCountingTotal] = useState<boolean>(false)
  const [progressSound, setProgressSound] = useState<any>(null);
  const [progressVideo] = useState<any>(null);
  const [progressImage, setProgressImage] = useState<any>(null);

  useEffect(() => {
    const getAppVersion = async () => {
      const version = await getVersion();
      setAppVersion(version);
    }
    const checkForUpdates = async () => {
      const updates = await check();
      if (updates) {
        setUpdateAvailable(true);
      }
    };
    invoke('trigger_folder_watcher', { folderPath: parentPath })

    checkForUpdates();
    getAppVersion();
  }, []);

  const handleProgressSound = useCallback((payload: any) => {
    setProgressSound(payload);
  }, [])

  const handleProgressImage = useCallback((payload: any) => {
    setProgressImage(payload);
  }, [])

  const handleCountingTotalChange = useCallback((counting: boolean) => {
    setCountingTotal(counting);
  }, [])

  const handleScanProgressDone = useCallback(async () => {
    // Update asset counts first
    await updateAssetsCount();

    // Then start thumbnail and waveform generation
    // These run in background threads in Rust
    try {
      await invoke("generate_missing_thumbnails");
      await invoke("generate_missing_waveforms");
    } catch (error) {
      console.error("Error generating thumbnails/waveforms:", error);
    }
  }, [updateAssetsCount])

  useEventListeners({
    onProgressSound: handleProgressSound,
    onProgressImage: handleProgressImage,
    onCountingTotalChange: handleCountingTotalChange,
    onUpdateAssetsCount: updateAssetsCount,
    onScanProgressDone: handleScanProgressDone
  });

  const handleUpdate = async () => {
    const update = await check();
    if (update) {
      await update.download();
      await update.install();
      window.location.reload();
    }
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
    <div className="flex flex-col w-[170px] bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between pt-3 px-3">
        <h3 className="text-sm font-medium select-none">Editon</h3>
      </div>
      <div className="mt-4 gap-1 flex flex-col h-screen px-3 select-none">
        {sidebarItems.map((item) => (
          <div
            key={item.path}
            className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-sidebar-accent/50 ${activeItem === item.path ? "bg-sidebar-accent" : ""
              }`}
            onClick={() => setActiveItem(item.path)}
          >
            {item.icon}
            <div className="flex justify-between w-full">
              <span className="text-sm">{item.label}</span>
              <span className="text-xs text-muted-foreground flex items-center">
                {!countingTotal ? item.type === "sfx" ? sfx : item.type === "video" ? video : item.type === "image" ? image : null : <Loader2 className="animate-spin" size={12} />}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 mb-2">
        {(progressSound || progressVideo || progressImage) && (
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
                    {progressSound?.name.toString()}
                    <span>{progressSound?.current} / {progressSound?.total}</span>
                  </div>}
                {progressVideo &&
                  <div className="flex justify-between">
                    {progressVideo?.name.toString()}
                    <span>{progressVideo?.current} / {progressVideo?.total}</span>
                  </div>}
                {progressImage &&
                  <div className="flex justify-between">
                    {progressImage?.name.toString()}
                    <span>{progressImage?.current} / {progressImage?.total}</span>
                  </div>
                }
              </div>
            </div>
          </div>
        )}
        {updateAvailable &&
          <div className="col-span-2 flex">
            <span className="text-sm text-green-500 p-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
              Update available
            </span>
            <Button variant="default" size="sm" onClick={handleUpdate}>Update</Button>
          </div>
        }

        <div className="p-2 flex gap-2 col-span-2 justify-center">
          <ModeToggle />
          <Button
            onClick={() => handleSetPath()}
            variant="outline"
            size="default"
          >
            Scan Folder
          </Button>
        </div>

        <div className="col-span-2 flex justify-center">
          <span className="text-xs text-accent-foreground">Version {appVersion}</span>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
