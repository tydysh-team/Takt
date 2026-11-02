import { Navigate, useParams } from "react-router-dom";

export function LegacyTeacherProfileRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/teachers/${id}` : "/teachers"} replace />;
}
