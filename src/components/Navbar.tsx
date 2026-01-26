import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Image, Loader2, Music, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { Progress } from "./ui/progress";
import { check } from "@tauri-apps/plugin-updater";
import { Button } from "./ui/button";
import { getVersion } from "@tauri-apps/api/app";
import { countAssets } from "@/lib/utils";

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
  const { setParentPath, setSfx, setVideo, setImage, sfx, video, image } = useAssetStore((state) => state);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [countingTotal, setCountingTotal] = useState<boolean>(false)
  const [progressSound, setProgressSound] = useState<any>(null);
  const [progressVideo, setProgressVideo] = useState<any>(null);
  const [progressImage, setProgressImage] = useState<any>(null);

  useEffect(() => {
    const getAppVersion = async () => {
      const version = await getVersion();
      setAppVersion(version);
    }
    getAppVersion();
  }, []);

  useEffect(() => {
    const checkForUpdates = async () => {
      const updates = await check();
      if (updates) {
        setUpdateAvailable(true);
      }
    };
    checkForUpdates();
  }, []);

  const handleSetPath = async () => {
    try {
      const path = await open({
        directory: true,
      });

      if (path) {
        await invoke("cancel_scan");
        setCountingTotal(true);
        await invoke('clear_db');

        setParentPath(path);

        await invoke("scan_and_import_folder", {
          folderPath: path,
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setupListeners = async () => {
      try {
        // File change listeners
        unlisteners.push(
          await listen("file-added", async (event) => {
            console.log("File added:", event.payload);
            const audio = await countAssets.audio() as number
            setSfx(audio)
          })
        );

        unlisteners.push(
          await listen("file-removed", (event) => {
            console.log("File removed:", event.payload);
          })
        );

        // Scan progress listener
        unlisteners.push(
          await listen("scan-progress", (event) => {
            const payload = event.payload as {
              count: number;
              last_files: string;
              status: string;
            };

            console.log(payload);
            if (payload.status === "finished") {
              invoke("generate_missing_thumbnails");
              invoke("generate_missing_waveforms");
              setCountingTotal(false);
            }
          })
        );

        // Waveform progress listener
        unlisteners.push(
          await listen("waveform-progress", (event) => {
            const payload = event.payload as {
              current: number;
              total: number;
              status: string;
            };

            setProgressSound(payload);

            if (payload.status === "done") {
              setProgressSound(null);
            }
          })
        );

        // Thumbnail progress listener
        unlisteners.push(
          await listen("thumbnail-progress", (event) => {
            const payload = event.payload as {
              current: number;
              total: number;
              status: string;
            };

            setProgressImage(payload);

            if (payload.status === "done") {
              setProgressImage(null);
            }
          })
        );
      } catch (error) {
        console.error("Failed to setup event listeners:", error);
      }
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handleUpdate = async () => {
    const update = await check();
    if (update) {
      await update.download();
      await update.install();
      window.location.reload();
    }
  }

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
        {progressSound && (
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
