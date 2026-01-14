import React from "react";
import Navbar from "./Navbar";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="bg-background text-foreground w-screen h-screen">
        <Navbar />
        <main className="flex-1">
            {children}
        </main>
    </div>
  );
};

export default Layout;
