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
        size="sm"
        onClick={onFirst}
        disabled={page <= 1 || loading}
        title="First page"
      >
        <span aria-hidden="true">|&lt;</span>
        <span className="button-label">First</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onPrev}
        disabled={page <= 1 || loading}
        title="Previous page"
      >
        <span aria-hidden="true">&lt;</span>
        <span className="button-label">Prev</span>
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onNext}
        disabled={page >= totalPages || loading}
        title="Next page"
      >
        <span className="button-label">Next</span>
        <span aria-hidden="true">&gt;</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onLast}
        disabled={page >= totalPages || loading}
        title="Last page"
      >
        <span className="button-label">Last</span>
        <span aria-hidden="true">&gt;|</span>
      </Button>
    </footer>
  );
}
