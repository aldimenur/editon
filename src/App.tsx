import "./App.css";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";
import SfxPage from "./pages/sfx";
import useNavStore from "./stores/nav-store";
import TitleBar from "./components/title-bar";
import VideoPage from "./pages/video";
import ImagePage from "./pages/image";
import YoutubeDownloadPage from "./pages/youtube-download";

const router = [
  {
    path: "/sound",
    element: <SfxPage />,
  },
  {
    path: "/video",
    element: <VideoPage />,
  },
  {
    path: "/image",
    element: <ImagePage />,
  },
  {
    path: "/youtube-download",
    element: <YoutubeDownloadPage />,
  }
];

function App() {
  const { activeItem } = useNavStore((state) => state);

  const renderContent = () => {
    return router.find((route) => route.path === activeItem)?.element;
  };

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="bg-background text-foreground w-screen h-screen flex">
        <Navbar />
        <main className="flex-1 max-h-screen overflow-y-hidden">
          <TitleBar />
          {renderContent()}
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
