import { Button } from "@/components/ui/button";
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

const YoutubeDownloadPage = () => {
  const [progress, setProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  const parseProgress = (line: string): number => {
    // Pola utama: "[download]  45.2% of    9.89MiB at ..."
    const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (progressMatch) {
      return parseFloat(progressMatch[1]);
    }

    // Pola alternatif untuk 100%: "[download] 100% of ..."
    const fullMatch = line.match(/\[download\]\s+100%/);
    if (fullMatch) {
      return 100.0;
    }

    return 0;
  }

  const checkDependencies = async () => {
    const response = await invoke("check_dependencies") as { yt_dlp_installed: boolean; bin_dir: string };
    console.log(response);
  }

  const downloadDependencies = async () => {
    const response = await invoke("download_dependencies");
    console.log(response);
  }

  const downloadVideo = async () => {
    const args = ["https://www.youtube.com/watch?v=WlhuQhYIXFo", "--progress"]

    const res = await invoke("run_ytdlp", { args })

    if (res == "Success") {
      return setVideoProgress(100)
    }
  }

  useEffect(() => {
    let unlisten: any;

    async function listener() {
      unlisten = await listen('ytdlp-output', (e: any) => {
        const progressValue = parseProgress(e.payload.message)
        setVideoProgress(progressValue)
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
      Progress : {videoProgress}
      <Button variant="default" onClick={checkDependencies}>Check</Button>
      <Button variant="default" onClick={downloadDependencies}>Dowwnload</Button>
      <Button variant="default" onClick={downloadVideo}>TEST</Button>
    </div>
  )
}

export default YoutubeDownloadPage;