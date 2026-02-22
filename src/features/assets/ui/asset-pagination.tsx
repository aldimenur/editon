import { Button } from "@/shared/ui/button";

type AssetPaginationProps = {
  page: number;
  totalPages: number;
  loading: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
};

export function AssetPagination({
  page,
  totalPages,
  loading,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: AssetPaginationProps) {
  return (
    <footer className="pager">
      <Button
        type="button"
        variant="ghost"
        onClick={onFirst}
        disabled={page <= 1 || loading}
      >
        First
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onPrev}
        disabled={page <= 1 || loading}
      >
        Prev
      </Button>
      <Button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages || loading}
      >
        Next
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onLast}
        disabled={page >= totalPages || loading}
      >
        Last
      </Button>
    </footer>
  );
}
