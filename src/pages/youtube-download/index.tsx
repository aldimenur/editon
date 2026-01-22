import { Button } from "@/components/ui/button";
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

const YoutubeDownloadPage = () => {
  const [progress, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(null);

  const checkDependencies = async () => {
    const response = await invoke("check_dependencies") as { yt_dlp_installed: boolean; bin_dir: string };
    console.log(response);
  }

  const downloadDependencies = async () => {
    const response = await invoke("download_dependencies");
    console.log(response);
  }

  const downloadVideo = async () => {
    const args = ["https://www.youtube.com/watch?v=iW2FUY3N-n0", "-P", ""]

    const res = await invoke("run_ytdlp", { args })
    console.log(res)
  }

  useEffect(() => {
    let unlisten: any;

    async function listener() {
      unlisten = await listen('ytdlp-output', (e) => {
        console.log(e)
        if (e.payload === 100) {
          return false;
        }
      })
    }

    listener()
    // window.location.reload();

    return () => {
      if (unlisten) unlisten();
    }
  }, [])

  useEffect(() => {
    let unlisten: any;

    async function listener() {
      unlisten = await listen('ffmpeg-download-progress', (e) => {
        setProgress(e.payload as number);

        if (e.payload === 100) {
          return false;
        }
      })

      unlisten = await listen('download-progress', (e: any) => {
        console.log(e);
        setProgress(e.progress);

        if (e.progress === 100) {
          return false;
        }
      })
    }

    listener()
    // window.location.reload();

    return () => {
      if (unlisten) unlisten();
    }
  }, [])

  return (
    <div>
      Progress : {progress}
      <Button variant="default" onClick={checkDependencies}>Check</Button>
      <Button variant="default" onClick={downloadDependencies}>Dowwnload</Button>
      <Button variant="default" onClick={downloadVideo}>TEST</Button>
    </div>
  )
}

export default YoutubeDownloadPage;