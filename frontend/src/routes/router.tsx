import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "../components/AppShell";
import { DashboardPage } from "../pages/DashboardPage";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { SchedulePage } from "../pages/SchedulePage";
import { ProfilePage } from "../pages/ProfilePage";
import { RegisterPage } from "../pages/RegisterPage";
import { StudentDetailPage } from "../pages/StudentDetailPage";
import { StudentsPage } from "../pages/StudentsPage";
import { TeacherDetailPage } from "../pages/TeacherDetailPage";
import { TeachersPage } from "../pages/TeachersPage";
import { RoleGate, SessionGate } from "./guards";
import { LegacyTeacherProfileRedirect } from "./LegacyTeacherProfileRedirect";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    element: <SessionGate publicOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: <SessionGate />,
    children: [
      {
        element: <RoleGate allowed={["TEACHER", "STUDENT"]} />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: "/dashboard", element: <DashboardPage /> },
              { path: "/profile", element: <ProfilePage /> },
              { path: "/schedule", element: <SchedulePage /> },
              { path: "/teacher-profile", element: <Navigate to="/profile" replace /> },
              { path: "/homework", element: <PlaceholderPage /> },
              {
                element: <RoleGate allowed={["TEACHER"]} />,
                children: [
                  { path: "/students", element: <StudentsPage /> },
                  { path: "/students/:id", element: <StudentDetailPage /> },
                ],
              },
              {
                element: <RoleGate allowed={["STUDENT"]} />,
                children: [
                  { path: "/teachers", element: <TeachersPage /> },
                  { path: "/teachers/:id", element: <TeacherDetailPage /> },
                  { path: "/teacher-profile/:id", element: <LegacyTeacherProfileRedirect /> },
                ],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

