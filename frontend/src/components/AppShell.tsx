import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/auth-context";
import { roleLabel } from "../shared/format";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";

const commonItems = [
  { to: "/dashboard", label: "Главная", mark: "⌂" },
  { to: "/schedule", label: "Расписание", mark: "□" },
  { to: "/homework", label: "Домашние задания", mark: "✓" },
  { to: "/profile", label: "Профиль", mark: "○" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const roleItem =
    user.role === "TEACHER"
      ? { to: "/students", label: "Ученики", mark: "◇" }
      : { to: "/teachers", label: "Преподаватели", mark: "◇" };
  const items = [commonItems[0], roleItem, ...commonItems.slice(1)];

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
          {items.map((item) => item ? (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => { setMenuOpen(false); }}
              className={({ isActive }) => `nav-item ${isActive ? "nav-item--active" : ""}`}
            >
              <span className="nav-item__mark" aria-hidden="true">{item.mark}</span>
              {item.label}
            </NavLink>
          ) : null)}
        </nav>
        <div className="sidebar__footer">
          <div className="user-summary">
            <Avatar firstName={user.first_name} lastName={user.last_name} size="small" />
            <div>
              <strong>{user.first_name} {user.last_name}</strong>
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
            <strong>{user.first_name} {user.last_name}</strong>
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

