import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import { faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Image, Music, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { Progress } from "./ui/progress";

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

  const handleSetPath = async () => {
    try {
      const path = await open({
        directory: true,
      });

      if (path) {
        // 1. Clear database dan reset count di UI ke 0 (opsional agar user tahu data sedang diproses)
        await invoke('clear_db');
        setSfx(0);
        setVideo(0);
        setImage(0);

        setParentPath(path);

        // 2. Scan folder baru (ini akan mengisi database dengan data baru)
        await invoke("scan_and_import_folder", {
          folderPath: path,
        });

        // 3. AMBIL COUNT SETELAH SCAN SELESAI
        const sfx = await invoke("get_count_assets", { assetType: "audio" });
        setSfx(sfx as number);
        const video = await invoke("get_count_assets", { assetType: "video" });
        setVideo(video as number);
        const image = await invoke("get_count_assets", { assetType: "image" });
        setImage(image as number);

        // 4. Jalankan proses background lainnya
        await invoke("generate_missing_waveforms");
        await invoke("generate_missing_thumbnails");
      }
    } catch (error) {
      console.error(error);
    }
  };


  const [progress, setProgress] = useState<any>(null); // { current, total, filename }

  useEffect(() => {
    let unlistenFunction: any

    async function setupListener() {
      // Mendengarkan event 'waveform-progress' dari Rust
      unlistenFunction = await listen("waveform-progress", (event) => {
        const payload = event.payload as {
          current: number;
          total: number;
          filename: string;
          status: string;
        }

        setProgress(payload)

        if (payload.status === "done") {
          setProgress(null);
          window.location.reload();
        }
      });

      unlistenFunction = await listen("thumbnail-progress", (event) => {
        const payload = event.payload as {
          current: number;
          total: number;
          filename: string;
          status: string;
        }

        setProgress(payload)

        if (payload.status === "done") {
          setProgress(null);
          window.location.reload();
        }
      });
    }

    setupListener();

    // Cleanup saat komponen didestroy
    return () => {
      if (unlistenFunction) unlistenFunction();
    };
  }, [])

  const progressPercentage = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;


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
              <span className="text-xs text-muted-foreground">
                {item.type === "sfx" ? sfx : item.type === "video" ? video : item.type === "image" ? image : null}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 mb-2">
        {progress && (
          <div className="col-span-2 animate-in slide-in-from-bottom-2 fade-in duration-300 p-2">
            <div className="bg-card border rounded-lg shadow-lg p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold">Optimizing...</h4>
                  <p className="text-xs text-muted-foreground truncate" title={progress.filename}>
                    {progress.filename}
                  </p>
                </div>
                <span className="text-xs font-medium text-primary shrink-0">
                  {Math.round(progressPercentage)}%
                </span>
              </div>

              {/* Progress Bar */}
              <Progress value={progressPercentage} className="h-1.5" />

              {/* Stats */}
              <div className="flex items-center justify-between text-xs text-muted-foreground truncate">
                <span>{progress.current} / {progress.total}</span>
                {progress.status && progress.status !== "done" && (
                  <span className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                    {progress.status}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-2 flex gap-2">
          <ModeToggle />
          <button
            className="text-sm text-muted-foreground cursor-pointer justify-end hover:bg-sidebar-accent min-w-24 rounded-md"
            onClick={() => handleSetPath()}
          >
            Scan Folder
          </button>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
