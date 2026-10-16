import { Navigate } from "react-router-dom";

import { LoadingState } from "../components/ui/Feedback";
import { useAuth } from "../features/auth/auth-context";

export function HomePage() {
  const { status } = useAuth();
  if (status === "bootstrapping") {
    return <main className="bootstrap-screen"><LoadingState label="Восстанавливаем сессию…" /></main>;
  }
  return <Navigate to={status === "authenticated" ? "/dashboard" : "/login"} replace />;
}

