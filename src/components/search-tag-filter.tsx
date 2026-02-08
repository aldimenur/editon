import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faTags } from "@fortawesome/free-solid-svg-icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SearchTagFilterProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  availableTags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
};

export default function SearchTagFilter({
  searchValue,
  onSearchChange,
  availableTags,
  selectedTags,
  onSelectedTagsChange,
}: SearchTagFilterProps) {
  const selectedTagText = useMemo(
    () =>
      selectedTags.length > 0 ? `${selectedTags.length} selected` : "Filter",
    [selectedTags.length],
  );

  return (
    <>
      <div className="relative flex-1 h-8 flex items-center min-w-[140px]">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]"
          fixedWidth
        />
        <Input
          type="text"
          placeholder="Search..."
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-6 pr-7 text-[11px] h-8 py-0 leading-none"
        />
      </div>

      {availableTags.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-0.5 h-5 px-1.5 text-[10px] shrink-0"
            >
              <FontAwesomeIcon
                icon={faTags}
                className="text-[10px]"
                fixedWidth
              />
              {selectedTagText}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by Tags</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={selectedTags.length === 0}
              onCheckedChange={() => onSelectedTagsChange([])}
            >
              All Tags
            </DropdownMenuCheckboxItem>
            {availableTags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag}
                checked={selectedTags.includes(tag)}
                onCheckedChange={() => {
                  if (selectedTags.includes(tag)) {
                    onSelectedTagsChange(
                      selectedTags.filter((item) => item !== tag),
                    );
                  } else {
                    onSelectedTagsChange([...selectedTags, tag]);
                  }
                }}
              >
                {tag}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
