import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import WavesurferRender from "@/components/wavesurfer";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const SfxPage = () => {
  const path = useAssetStore((state) => state.path);
  const [files, setFiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { setSfx } = useAssetStore((state) => state);

  useEffect(() => {
    readMediaFiles();
  }, [path, searchQuery]);

  const readMediaFiles = async () => {
    try {
      const files: any = await invoke("list_sounds", {
        folderPath: path,
        page: 1,
        pageSize: 6,
        query: searchQuery || null,
      });
      setSfx(files.total);
      setFiles(files.assets as any[]);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="h-[calc(100vh-100px)] overflow-y-auto">
        <div className="space-y-2">
          {files.length > 0 ? (
            files.map((file: any) => (
              <div key={file.path} className="border rounded-lg">
                <p className="text-sm font-medium mb-2 bg-accent p-1">
                  {file.name}
                </p>
                <WavesurferRender src={file.path} height={50} width={"100%"} />
              </div>
            ))
          ) : (
            <div className="text-center text-muted-foreground py-8 text-sm">
              {searchQuery
                ? "No files found matching your search"
                : "No sound files found"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SfxPage;
