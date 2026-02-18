import { useYoutubeDownload } from "@/features/youtube-download/hooks/use-youtube-download";
import YoutubeDependenciesPanel from "@/features/youtube-download/ui/youtube-dependencies-panel";
import YoutubeDownloadForm from "@/features/youtube-download/ui/youtube-download-form";

export default function YoutubeDownloadPage() {
  const {
    progress,
    videoProgress,
    url,
    setUrl,
    downloadType,
    setDownloadType,
    quality,
    setQuality,
    format,
    setFormat,
    downloadPath,
    isLoading,
    errorMsg,
    qualityOptions,
    formatOptions,
    dependencyItems,
    allDependenciesInstalled,
    checkDependencies,
    downloadDependencies,
    startDownload,
    browseDestination,
  } = useYoutubeDownload();

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 max-h-[calc(100vh-40px)] overflow-auto">
      <YoutubeDownloadForm
        url={url}
        onUrlChange={setUrl}
        downloadType={downloadType}
        onDownloadTypeChange={setDownloadType}
        format={format}
        onFormatChange={setFormat}
        formatOptions={formatOptions}
        quality={quality}
        onQualityChange={setQuality}
        qualityOptions={qualityOptions}
        downloadPath={downloadPath}
        onBrowseDestination={browseDestination}
        videoProgress={videoProgress}
        errorMsg={errorMsg}
        isLoading={isLoading}
        onStartDownload={startDownload}
      />

      <YoutubeDependenciesPanel
        dependencyItems={dependencyItems}
        allDependenciesInstalled={allDependenciesInstalled}
        progress={progress}
        isLoading={isLoading}
        onCheckDependencies={checkDependencies}
        onDownloadDependencies={downloadDependencies}
      />
    </div>
  );
}
