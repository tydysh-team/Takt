import { useSearchParams } from "react-router-dom";

import { HomeworkPanel } from "../features/homework/HomeworkPanel";
import { periodFromSearch } from "../features/progress/period-url";

export function HomeworkPage() {
  const [search] = useSearchParams();
  return <HomeworkPanel period={periodFromSearch(search)} />;
}
