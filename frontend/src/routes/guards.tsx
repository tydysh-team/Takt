import type { PropsWithChildren } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import type { ApplicationRole } from "../api/types";
import { LoadingState } from "../components/ui/Feedback";
import { useAuth } from "../features/auth/auth-context";
import { canAccessRole } from "../features/auth/roles";
import { ForbiddenPage } from "../pages/ForbiddenPage";

export function SessionGate({ publicOnly = false, children }: PropsWithChildren<{ publicOnly?: boolean }>) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "bootstrapping") {
    return <main className="bootstrap-screen"><LoadingState label="Восстанавливаем сессию…" /></main>;
  }
  if (publicOnly && status === "authenticated") return <Navigate to="/dashboard" replace />;
  if (!publicOnly && status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children ?? <Outlet />;
}

export function RoleGate({ allowed }: { allowed: ApplicationRole[] }) {
  const { user } = useAuth();
  if (!canAccessRole(user, allowed)) return <ForbiddenPage />;
  return <Outlet />;
}
