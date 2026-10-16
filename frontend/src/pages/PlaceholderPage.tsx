import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";

export function PlaceholderPage({ section }: { section: "schedule" | "homework" }) {
  const schedule = section === "schedule";
  return (
    <>
      <PageHeader
        eyebrow="Будущий раздел"
        title={schedule ? "Расписание" : "Домашние задания"}
        description="Мы готовим этот инструмент для следующего этапа Takt."
      />
      <Card className="placeholder-panel placeholder-panel--large">
        <span className="badge">Скоро</span>
        <h2>{schedule ? "Планирование занятий" : "Работа с заданиями"}</h2>
        <p>{schedule ? "Здесь появится удобное расписание занятий." : "Здесь появится пространство для домашних заданий."}</p>
        <p className="muted">На Foundation-этапе раздел не создаёт и не использует фиктивные данные.</p>
      </Card>
    </>
  );
}
