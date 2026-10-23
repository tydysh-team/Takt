import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/auth-context";
import { hasRole } from "../features/auth/roles";
import { fullName, roleLabel } from "../shared/format";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";

const commonItems = [
  { to: "/dashboard", label: "Главная", icon: "home" },
  { to: "/schedule", label: "Расписание", icon: "calendar" },
  { to: "/homework", label: "Домашние задания", icon: "check" },
  { to: "/profile", label: "Профиль", icon: "user" },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5M5.5 9v10h13V9M9 19v-5h6v5",
    calendar: "M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2ZM3 9h18M8 2v4M16 2v4",
    check: "M5 12.5 9 16l10-10M4 4h4M4 20h16",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
    users: "M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] ?? paths.user} /></svg>;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const roleItem = hasRole(user, "TEACHER")
    ? { to: "/students", label: "Ученики", icon: "users" }
    : { to: "/teachers", label: "Преподаватели", icon: "users" };
  const items = [...commonItems.slice(0, 1), roleItem, ...commonItems.slice(1)];

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      await navigate("/login", { replace: true });
    }
  };

  return (
    <div className="workspace">
      <button
        className="mobile-menu"
        type="button"
        onClick={() => { setMenuOpen((open) => !open); }}
        aria-expanded={menuOpen}
        aria-controls="application-sidebar"
      >
        <span aria-hidden="true">☰</span>
        Меню
      </button>
      {menuOpen ? (
        <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => { setMenuOpen(false); }} />
      ) : null}
      <aside id="application-sidebar" className={`sidebar ${menuOpen ? "sidebar--open" : ""}`}>
        <NavLink className="sidebar__brand" to="/dashboard" onClick={() => { setMenuOpen(false); }}>
          <span className="brand-mark">T</span>
          <span>Takt</span>
        </NavLink>
        <nav className="sidebar__nav" aria-label="Основная навигация">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => { setMenuOpen(false); }}
              className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
            >
              <span className="nav-item__mark"><NavIcon name={item.icon} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="user-summary">
            <Avatar firstName={user.first_name} lastName={user.last_name} size="small" />
            <div>
              <strong>{fullName(user)}</strong>
              <span>{roleLabel(user.role)}</span>
            </div>
          </div>
          <Button variant="ghost" className="logout-button" onClick={() => void handleLogout()}>
            Выйти
          </Button>
        </div>
      </aside>
      <main className="workspace__main">
        <header className="workspace__topbar">
          <div>
            <span className="workspace__greeting">Рабочее пространство</span>
            <strong>{fullName(user)}</strong>
          </div>
          <Avatar firstName={user.first_name} lastName={user.last_name} />
        </header>
        <div className="workspace__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

