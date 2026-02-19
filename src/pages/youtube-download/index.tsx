import { useYoutubeDownload } from "@/features/youtube-download/hooks/use-youtube-download";
import YoutubeDependenciesPanel from "@/features/youtube-download/ui/youtube-dependencies-panel";
import YoutubeDownloadForm from "@/features/youtube-download/ui/youtube-download-form";
import { PageHeader, PageLayout } from "@/components/shell/page-layout";

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
    isBrowserQa,
    setDownloadPath,
  } = useYoutubeDownload();

  return (
    <PageLayout>
      <PageHeader title="YouTube download" subtitle="URL, options, download" />

      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
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
          onDownloadPathChange={setDownloadPath}
          isDestinationEditable={isBrowserQa}
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
    </PageLayout>
  );
}
