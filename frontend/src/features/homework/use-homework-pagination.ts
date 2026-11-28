import { useCallback, useState } from "react";

import { DEFAULT_HOMEWORK_PAGE_SIZE, isHomeworkPageSize, type HomeworkPageSize } from "../../api/queries";

interface PagePosition {
  /** Zero-based page index exactly as it was chosen by the user. */
  page: number;
  /** Number of records on a page, always one of the supported page sizes. */
  pageSize: HomeworkPageSize;
}

export interface HomeworkPagination extends PagePosition {
  offset: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  /** Back to the first page while keeping the chosen page size. */
  reset: () => void;
}

export function pageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Clamp a requested page into the valid range of an existing result set. */
export function clampPage(page: number, total: number | undefined, pageSize: number): number {
  const lastPage = pageCount(total ?? 0, pageSize) - 1;
  return Math.min(Math.max(0, Math.trunc(page)), lastPage);
}

export function pageOffset(page: number, pageSize: number): number {
  return Math.max(0, Math.trunc(page)) * pageSize;
}

export function clampOffset(offset: number, total: number, pageSize: number): number {
  return pageOffset(clampPage(Math.floor(offset / pageSize), total, pageSize), pageSize);
}

/**
 * Page position for the homework list and the review queue.
 *
 * Page and page size are memoized together: changing the size always lands on
 * the first page, so the offset can never point past the end of the list.
 */
export function useHomeworkPagination(initialPageSize: HomeworkPageSize = DEFAULT_HOMEWORK_PAGE_SIZE): HomeworkPagination {
  const [{ page, pageSize }, setPosition] = useState<PagePosition>({ page: 0, pageSize: initialPageSize });
  const setPage = useCallback((nextPage: number) => {
    setPosition((current) => ({ ...current, page: Math.max(0, Math.trunc(Number.isFinite(nextPage) ? nextPage : 0)) }));
  }, []);
  const setPageSize = useCallback((nextSize: number) => {
    setPosition({
      page: 0,
      pageSize: isHomeworkPageSize(nextSize) ? nextSize : DEFAULT_HOMEWORK_PAGE_SIZE,
    });
  }, []);
  const nextPage = useCallback(() => {
    setPosition((current) => ({ ...current, page: current.page + 1 }));
  }, []);
  const previousPage = useCallback(() => {
    setPosition((current) => ({ ...current, page: Math.max(0, current.page - 1) }));
  }, []);
  const reset = useCallback(() => {
    setPosition((current) => ({ page: 0, pageSize: current.pageSize }));
  }, []);
  return { page, pageSize, offset: pageOffset(page, pageSize), setPage, setPageSize, nextPage, previousPage, reset };
}
