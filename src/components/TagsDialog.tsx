import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Tag } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invoke } from "@tauri-apps/api/core";

interface TagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: number;
  currentTags: string | null;
  availableTags: string[];
  onTagsUpdated: () => void;
}

const TagsDialog = ({
  open,
  onOpenChange,
  assetId,
  currentTags,
  availableTags,
  onTagsUpdated,
}: TagsDialogProps) => {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (!open) return;
    const parsedTags = currentTags
      ? currentTags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : [];
    setTags(parsedTags);
  }, [open, currentTags, assetId]);

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const addExistingTag = (tagToAdd: string) => {
    if (!tags.includes(tagToAdd)) {
      setTags([...tags, tagToAdd]);
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  const saveTags = async () => {
    try {
      const tagsString = tags.length > 0 ? tags.join(", ") : null;
      await invoke("update_asset_tags", {
        assetId,
        tags: tagsString,
      });
      onTagsUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update tags:", error);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Manage Tags
          </AlertDialogTitle>
          <AlertDialogDescription>
            Add or remove tags for this asset. Tags help organize and search
            your files.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Current tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md text-sm"
                >
                  <span>{tag}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeTag(tag)}
                    className="h-3 w-3 p-0 hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Available tags */}
          {availableTags.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Available tags
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTags
                  .filter((tag) => !tags.includes(tag))
                  .map((tag) => (
                    <Button
                      key={tag}
                      variant="outline"
                      size="sm"
                      onClick={() => addExistingTag(tag)}
                      className="h-7 px-2 text-xs"
                    >
                      {tag}
                    </Button>
                  ))}
              </div>
            </div>
          )}

          {/* Add new tag */}
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Add a tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={addTag}
              disabled={!newTag.trim() || tags.includes(newTag.trim())}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={saveTags}>Save Tags</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default TagsDialog;
