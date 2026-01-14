import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import Layout from "./Layout";
import NewPage from "../pages/new";
import HomePage from "@/pages/home";

// Root layout wrapper
const RootLayout = () => {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

// Create router configuration
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "new",
        element: <NewPage />,
      },
    ],
  },
]);

// Router provider component
export const AppRouterProvider = () => {
  return <RouterProvider router={router} />;
};

export default AppRouterProvider;
