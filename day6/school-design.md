# School Database Design

This database stores students, the courses they take, and their grades. It is written for SQLite and defined in `school.sql`.

## Tables

### students

Holds one row per student.

- `id`: primary key, numbered automatically.
- `name`: required (`NOT NULL`).
- `email`: required and `UNIQUE`, so two students cannot share an email address.

### courses

Holds one row per course.

- `id`: primary key.
- `title`: required.
- `credits`: required, defaults to 3.

### enrolments

Holds one row for each student enrolled on a course. It links the other two tables and stores the grade.

- `id`: primary key.
- `student_id`: foreign key to `students(id)`.
- `course_id`: foreign key to `courses(id)`.
- `grade`: optional, because a grade does not exist until the course is marked.
- `UNIQUE (student_id, course_id)`: the same student cannot enrol on the same course twice.
- Both foreign keys use `ON DELETE CASCADE`, so deleting a student or a course also removes the related enrolments.

## Relationships

- **One-to-many:** one student can have many enrolments, and one course can have many enrolments. Each enrolment belongs to exactly one student and one course.
- **Many-to-many:** a student can take many courses, and a course can have many students. Together, students and courses form a many-to-many relationship.
- **Why a join table is needed:** a single column cannot hold several ids without breaking the rule that each column holds one value. Putting a `course_id` column in `students` would allow only one course per student, and a comma-separated list would be hard to search and update. The `enrolments` table stores one pair of ids per row, so any number of students can link to any number of courses. It also gives us a natural place to store the grade, which belongs to the pair rather than to either side alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The reason is that queries such as "all students on this course" and "number of students per course" search `enrolments` by `course_id`. Without an index, the database scans every enrolment row. With the index, it jumps straight to the matching rows. The `UNIQUE (student_id, course_id)` rule already creates an index that starts with `student_id`, so searches by student are covered, but searches by course are not. The trade-off is that every insert, update and delete must also update the index, and it uses a little extra storage. That is worth it because enrolments are read far more often than they are changed.

## SQL or NoSQL?

I would choose SQL (a relational database such as PostgreSQL or SQLite) for this system. The data is clearly structured, with students, courses and enrolments that have fixed columns and strong relationships, and many of the questions we ask need JOINs, such as which courses a student takes or how many students are on each course. A relational database enforces the rules for us: unique emails, no duplicate enrolments, and no enrolment for a student who does not exist. Transactions also keep related changes consistent, which matters for school records and grades. A document database could store a student with their courses embedded inside, but then course details would be duplicated across students and could become inconsistent. NoSQL would become more attractive only if the data became very flexible or grew to a scale that needs many servers, which is unlikely for a school.
