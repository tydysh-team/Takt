"""Manual HTTP smoke against a disposable development/test backend instance.

Run only against a non-production database; this creates two sample accounts.
"""

import argparse
import secrets

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    args = parser.parse_args()
    suffix = secrets.token_hex(5)
    password = "abcdefgh"
    teacher_email = f"refactor-teacher-{suffix}@example.com"
    student_email = f"refactor-student-{suffix}@example.com"

    with (
        httpx.Client(base_url=args.base_url, timeout=10) as teacher,
        httpx.Client(base_url=args.base_url, timeout=10) as student,
    ):
        response = teacher.post(
            "/api/v1/auth/register",
            json={
                "email": teacher_email,
                "password": password,
                "role": "TEACHER",
                "first_name": "Иван",
                "last_name": "Иванов",
                "middle_name": "Иванович",
            },
        )
        assert response.status_code == 201, response.text
        teacher_id = response.json()["id"]
        assert response.json()["role"] == "TEACHER"
        assert response.json()["middle_name"] == "Иванович"

        response = student.post(
            "/api/v1/auth/register",
            json={
                "email": student_email,
                "password": password,
                "role": "STUDENT",
                "first_name": "Анна",
                "last_name": "Смирнова",
            },
        )
        assert response.status_code == 201, response.text
        student_id = response.json()["id"]
        assert response.json()["role"] == "STUDENT"
        assert response.json()["middle_name"] is None

        teacher_login = teacher.post(
            "/api/v1/auth/login", json={"email": teacher_email, "password": password}
        )
        student_login = student.post(
            "/api/v1/auth/login", json={"email": student_email, "password": password}
        )
        assert teacher_login.status_code == student_login.status_code == 200
        teacher_headers = {"Authorization": "Bearer " + teacher_login.json()["access_token"]}
        student_headers = {"Authorization": "Bearer " + student_login.json()["access_token"]}
        assert teacher.get("/api/v1/me", headers=teacher_headers).json()["role"] == "TEACHER"
        assert student.get("/api/v1/me", headers=student_headers).json()["role"] == "STUDENT"
        removed_me_route = "/api/v1/auth" + "/me"
        assert teacher.get(removed_me_route, headers=teacher_headers).status_code == 404
        assert teacher.get("/api/v1/profile", headers=teacher_headers).json()[
            "timezone"
        ] == "Europe/Moscow"
        assert teacher.get("/api/v1/profile", headers=teacher_headers).json()[
            "middle_name"
        ] == "Иванович"
        profile = student.patch(
            "/api/v1/profile",
            headers=student_headers,
            json={"middle_name": " Петровна ", "timezone": "Europe/Samara"},
        )
        assert profile.status_code == 200
        assert profile.json()["middle_name"] == "Петровна"
        assert profile.json()["timezone"] == "Europe/Samara"
        profile = student.patch(
            "/api/v1/profile", headers=student_headers, json={"middle_name": None}
        )
        assert profile.status_code == 200 and profile.json()["middle_name"] is None
        assert teacher.get("/api/v1/teachers", headers=teacher_headers).status_code == 403
        assert student.get("/api/v1/students", headers=student_headers).status_code == 403

        invitation = teacher.post("/api/v1/invitations", headers=teacher_headers)
        assert invitation.status_code == 201, invitation.text
        accepted = student.post(
            "/api/v1/connections/accept",
            headers=student_headers,
            json={"code": invitation.json()["code"]},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["teacher"]["id"] == teacher_id
        students = teacher.get("/api/v1/students", headers=teacher_headers)
        teachers = student.get("/api/v1/teachers", headers=student_headers)
        assert students.status_code == 200
        assert any(item["id"] == student_id for item in students.json())
        assert teachers.status_code == 200
        assert any(item["id"] == teacher_id for item in teachers.json())
        note = teacher.patch(
            f"/api/v1/students/{student_id}/note",
            headers=teacher_headers,
            json={"note": "private smoke note"},
        )
        assert note.status_code == 200, note.text
        assert "teacher_note" not in student.get(
            f"/api/v1/teachers/{teacher_id}", headers=student_headers
        ).text

        csrf = teacher.cookies.get("takt_csrf")
        refreshed = teacher.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
        assert refreshed.status_code == 200, refreshed.text
        csrf = teacher.cookies.get("takt_csrf")
        logged_out = teacher.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
        assert logged_out.status_code == 204

    print(
        "Smoke OK: single roles, names, timezone, auth, permissions, invitation, "
        "connection, privacy, refresh, logout"
    )


if __name__ == "__main__":
    main()
