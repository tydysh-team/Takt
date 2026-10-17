import { Link } from "react-router-dom";

import { formatDate, fullName } from "../shared/format";
import { Avatar } from "./ui/Avatar";

interface PersonCardProps {
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    connected_at: string;
    timezone: string;
  };
  basePath: "/students" | "/teachers" | "/teacher-profile";
  status?: string;
}

export function PersonCard({ person, basePath, status }: PersonCardProps) {
  return (
    <article className="person-card">
      <Avatar firstName={person.first_name} lastName={person.last_name} />
      <div className="person-card__identity">
        <strong>{fullName(person)}</strong>
        <span>{person.email}</span>
      </div>
      <div className="person-card__meta">
        <span>Подключение</span>
        <strong>{formatDate(person.connected_at)}</strong>
      </div>
      {status ? <span className="badge badge--success">{status === "ACTIVE" ? "Активен" : status}</span> : null}
      <Link className="button button--secondary" to={`${basePath}/${person.id}`}>Открыть</Link>
    </article>
  );
}
