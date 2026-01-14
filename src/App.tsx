import "./App.css";
import { ThemeProvider } from "./components/theme-provider";
import AppRouterProvider from "./components/router-provider";

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AppRouterProvider />
    </ThemeProvider>
  );
}

export default App;
