import "./App.css";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";
import SfxPage from "./pages/sfx";
import useNavStore from "./stores/nav-store";

const router = [
  {
    path: "/sound",
    element: <SfxPage />,
  },
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
        <main className="flex-1">{renderContent()}</main>
      </div>
    </ThemeProvider>
  );
}

export default App;
