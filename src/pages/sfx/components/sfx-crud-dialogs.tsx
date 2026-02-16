import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SfxCrudDialogsProps = {
  deleteDialogOpen: boolean;
  deleteTargets: string[];
  onDeleteDialogChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  renameDialogOpen: boolean;
  setRenameDialogOpen: (open: boolean) => void;
  newFileName: string;
  setNewFileName: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
};

export default function SfxCrudDialogs({
  deleteDialogOpen,
  deleteTargets,
  onDeleteDialogChange,
  onDeleteConfirm,
  renameDialogOpen,
  setRenameDialogOpen,
  newFileName,
  setNewFileName,
  onRenameConfirm,
  onRenameCancel,
}: SfxCrudDialogsProps) {
  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={onDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete
              {deleteTargets.length > 1
                ? ` ${deleteTargets.length} files`
                : " the file"}{" "}
              from your system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => onDeleteDialogChange(false)}
              className="h-6 px-2 text-[11px]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDeleteConfirm}
              className="h-6 px-2 text-[11px]"
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename File</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="text"
            value={newFileName}
            onChange={(event) => setNewFileName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onRenameConfirm();
              } else if (event.key === "Escape") {
                onRenameCancel();
              }
            }}
            placeholder="New file name"
            className="mt-2"
            autoFocus
          />
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={onRenameCancel}
              className="h-6 px-2 text-[11px]"
            >
              Cancel
            </Button>
            <Button
              onClick={onRenameConfirm}
              disabled={!newFileName.trim()}
              className="h-6 px-2 text-[11px]"
            >
              Rename
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
