import { LayoutGrid, LayoutList, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ViewMode = "list" | "grid" | "large";

type ViewModeSelectorProps = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  compact?: boolean;
  iconOnly?: boolean;
  className?: string;
};

export default function ViewModeSelector({
  value,
  onChange,
  compact = false,
  iconOnly = false,
  className,
}: ViewModeSelectorProps) {
  if (iconOnly) {
    return (
      <div className={className ?? "flex gap-1 mr-1"}>
        <Button
          variant={value === "list" ? "default" : "outline"}
          size="icon"
          onClick={() => onChange("list")}
          className="h-7 w-7"
        >
          <LayoutList className="h-4 w-4" />
        </Button>
        <Button
          variant={value === "grid" ? "default" : "outline"}
          size="icon"
          onClick={() => onChange("grid")}
          className="h-7 w-7"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant={value === "large" ? "default" : "outline"}
          size="icon"
          onClick={() => onChange("large")}
          className="h-7 w-7"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const buttonClassName = compact ? "flex-1 h-5 text-[10px]" : "flex-1";
  const iconClassName = compact ? "h-3 w-3 mr-1" : "h-4 w-4 mr-1";

  return (
    <div className="px-2 py-1">
      <p className="text-xs font-medium text-muted-foreground mb-1">
        View Mode
      </p>
      <div className="flex gap-0.5">
        <Button
          variant={value === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("list")}
          className={buttonClassName}
        >
          <LayoutList className={iconClassName} />
          List
        </Button>
        <Button
          variant={value === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("grid")}
          className={buttonClassName}
        >
          <LayoutGrid className={iconClassName} />
          Grid
        </Button>
        <Button
          variant={value === "large" ? "default" : "outline"}
          size="sm"
          onClick={() => onChange("large")}
          className={buttonClassName}
        >
          <Maximize2 className={iconClassName} />
          Large
        </Button>
      </div>
    </div>
  );
}
