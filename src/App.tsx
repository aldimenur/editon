import { useEffect } from "react";
import "./App.css";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";
import SfxPage from "./pages/sfx";
import useNavStore from "./stores/nav-store";
import { invoke } from "@tauri-apps/api/core";
import useAssetStore from "./stores/asset-store";

const router = [
  {
    path: "/sound",
    element: <SfxPage />,
  },
];

function App() {
  const { activeItem } = useNavStore((state) => state);
  const { setSfx, sfxPath } = useAssetStore((state) => state);

  const renderContent = () => {
    return router.find((route) => route.path === activeItem)?.element;
  };

  const getSoundCount = async () => {
    const soundCount: any = await invoke("list_sounds", {
      folderPath: sfxPath,
      page: 1,
      pageSize: 6,
      query: null,
    });
    setSfx(soundCount.total);
  };

  useEffect(() => {
    getSoundCount();
  }, [sfxPath]);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="bg-background text-foreground w-screen h-screen flex">
        <Navbar />
        <main className="flex-1 max-h-screen overflow-y-hidden">
          {renderContent()}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
