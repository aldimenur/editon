import useNavStore from "@/stores/nav-store";
import { Separator } from "@radix-ui/react-separator";
import { Music, Video } from "lucide-react";

const sidebarItems = [
  {
    icon: Music,
    label: "Music",
    path: "/music",
  },
  {
    icon: Video,
    label: "Video",
    path: "/video",
  },
];

const Navbar = () => {
  const activeItem = useNavStore((state) => state.activeItem);
  const setActiveItem = useNavStore((state) => state.setActiveItem);

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
            <span className="text-sm">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Navbar;
