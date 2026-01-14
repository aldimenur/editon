import useAssetStore from "@/stores/asset-store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

const SfxPage = () => {
  const path = useAssetStore((state) => state.path);
  const [files, setFiles] = useState<any[]>([]);

  console.log(path);

  useEffect(() => {
    readMediaFiles();
  }, [path]);

  const readMediaFiles = async () => {
    try {
      const files = await invoke("list_sounds", { folderPath: path });
      console.log(files);
      setFiles(files as any);
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <div>
      {files.map((file: any) => (
        <div key={file.path}>
          <audio src={convertFileSrc(file.path)} controls />
        </div>
      ))}
    </div>
  );
};

export default SfxPage;
