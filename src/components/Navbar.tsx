import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import { Separator } from "@radix-ui/react-separator";
import { Image, Music, Video } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
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
    icon: Music,
    label: "Music",
    path: "/music",
    type: "music",
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
    music,
    video,
    image,
    setSfxPath,
    setVideoPath,
    setMusicPath,
    setImagePath,
  } = useAssetStore((state) => state);

  const renderCount = (type: string) => {
    if (type === "sfx") return sfx;
    if (type === "video") return video;
    if (type === "music") return music;
    if (type === "image") return image;
    return null;
  };

  const handleSetPath = async (type: string) => {
    try {
      const path = await open({
        directory: true,
      });

      if (path) {
        if (type === "sfx") {
          setSfxPath(path);
        }
        if (type === "video") {
          setVideoPath(path);
        }
        if (type === "music") {
          setMusicPath(path);
        }
        if (type === "image") {
          setImagePath(path);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col pt-4 px-3 w-[170px] bg-sidebar text-sidebar-foreground">
      <h3 className="text-sm font-medium">Editon</h3>
      <Separator />
      <div className="mt-4 gap-1 flex flex-col h-screen">
        {sidebarItems.map((item) => (
          <div
            key={item.path}
            className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-sidebar-accent/50 ${
              activeItem === item.path ? "bg-sidebar-accent" : ""
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
        {sidebarItems.map((item) => (
          <div key={item.path}>
            <button
              className="text-sm text-muted-foreground cursor-pointer justify-end hover:bg-sidebar-accent rounded-md p-2"
              onClick={() => handleSetPath(item.type)}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
      <div className="mb-2">
        <ModeToggle />
      </div>
    </div>
  );
};

export default Navbar;
