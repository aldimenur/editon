import useAssetStore from "@/stores/asset-store";
import useNavStore from "@/stores/nav-store";
import { Separator } from "@radix-ui/react-separator";
import { Music, Video } from "lucide-react";

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
];

const Navbar = () => {
  const { activeItem, setActiveItem } = useNavStore((state) => state);
  const { sfx, music, video } = useAssetStore((state) => state);

  const renderCount = (type: string) => {
    if (type === "sfx") return sfx;
    if (type === "video") return video;
    if (type === "music") return music;
    return null;
  };

  return (
    <div className="flex flex-col pt-4 px-3 w-[170px] bg-sidebar text-sidebar-foreground">
      <h3 className="text-sm font-medium">Editon</h3>
      <Separator />
      <div className="mt-4 gap-1 flex flex-col">
        {sidebarItems.map((item) => (
          <div
            key={item.path}
            className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer ${
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
    </div>
  );
};

export default Navbar;
