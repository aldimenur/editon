import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Image, Music, Video } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

const sidebarItems = [
  {
    icon: Music,
    label: "Sound",
    path: "/sound",
    type: "sfx",
  },
  {
    icon: Video,
    label: "Video",
    path: "/video",
    type: "video",
  },
  {
    icon: Image,
    label: "Image",
    path: "/image",
    type: "image",
  },
];

const Navbar = () => {
  const { activeItem, setActiveItem } = useNavStore((state) => state);
  const {
    sfx,
    video,
    image,
    setParentPath
  } = useAssetStore((state) => state);

  const renderCount = (type: string) => {
    if (type === "sfx") return sfx;
    if (type === "video") return video;
    if (type === "image") return image;
    return null;
  };

  const handleSetPath = async () => {
    try {
      const path = await open({
        directory: true,
      });

      if (path) {
        await invoke('clear_db');
        setParentPath(path);
        await invoke("scan_and_import_folder", {
          folderPath: path,
        });
        await invoke("generate_missing_waveforms");
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
      <div className="mt-4 gap-1 flex flex-col h-screen px-3">
        {sidebarItems.map((item) => (
          <div
            key={item.path}
            className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-sidebar-accent/50 ${activeItem === item.path ? "bg-sidebar-accent" : ""
              }`}
            onClick={() => setActiveItem(item.path)}
          >
            <item.icon size={14} />
            <div className="flex justify-between w-full">
              <span className="text-sm">{item.label}</span>
              <span className="text-xs text-muted-foreground">
                {renderCount(item.type)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 mb-2">
        <button
          className="text-sm text-muted-foreground cursor-pointer justify-end hover:bg-sidebar-accent rounded-md p-2"
          onClick={() => handleSetPath()}
        >
          Import Folder
        </button>

        <div className="mb-2">
          <ModeToggle />
        </div>
      </div>
    </div>
  );
};

export default Navbar;
