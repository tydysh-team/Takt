import type { ReactNode } from "react";

import type { ProgressResponse } from "../../api/types";
import { AttendanceBlock } from "./AttendanceBlock";
import { HomeworkBlock } from "./HomeworkBlock";
import { ReviewsBlock } from "./ReviewsBlock";

export function ProgressReport({
  data,
  attendanceAction,
  homeworkAction,
  reviewsAction,
}: {
  data: ProgressResponse;
  attendanceAction?: ReactNode;
  homeworkAction?: ReactNode;
  reviewsAction?: ReactNode;
}) {
  return (
    <div className="progress-report">
      <AttendanceBlock data={data.attendance} action={attendanceAction} />
      <HomeworkBlock data={data.homework} action={homeworkAction} />
      <ReviewsBlock data={data.reviews} action={reviewsAction} />
    </div>
  );
}
