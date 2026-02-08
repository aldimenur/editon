import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
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
import { Tags } from "lucide-react";

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
  return (
    <>
      <div className="relative flex-1 h-8 flex items-center min-w-[140px]">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]"
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
              className="gap-0.5 px-1.5 text-[10px] relative h-8 w-8"
            >
              {selectedTags.length !== 0 &&
                <div className="absolute top-[-8px] left-[-4px] bg-red-400 w-4 h-4 rounded-full text-white">
                  {selectedTags.length}
                </div>
              }
              <Tags size="lg"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Filter by Tags</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={selectedTags.length === 0}
              onCheckedChange={() => onSelectedTagsChange([])}
              className="text-[10px]"
            >
              All Tags
            </DropdownMenuCheckboxItem>
            {availableTags.map((tag) => (
              <DropdownMenuCheckboxItem
                className="text-[10px]"
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
