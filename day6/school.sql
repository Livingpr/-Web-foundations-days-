-- =====================================================
-- School database (SQLite)
-- Tables: students, courses, enrolments
-- =====================================================

PRAGMA foreign_keys = ON;  -- SQLite only enforces foreign keys when this is on

-- Drop old tables so this file can be re-run safely (children first)
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- 1. Tables ----------

CREATE TABLE students (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  email  TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  credits  INTEGER NOT NULL DEFAULT 3
);

-- Join table: one row = one student enrolled on one course
CREATE TABLE enrolments (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  grade       TEXT,  -- may be empty until the course is marked
  UNIQUE (student_id, course_id),  -- no double enrolment
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

-- Index for looking up enrolments by course (reason in school-design.md)
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);

-- ---------- 2. Sample data ----------

INSERT INTO students (name, email) VALUES
  ('Amina Otieno', 'amina@example.com'),
  ('Brian Kamau', 'brian@example.com'),
  ('Grace Wanjiku', 'grace@example.com'),
  ('David Mutua', 'david@example.com');

INSERT INTO courses (title, credits) VALUES
  ('Web Foundations', 4),
  ('Databases', 3),
  ('Python Basics', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'A'),
  (1, 2, 'B'),
  (2, 1, 'B'),
  (2, 3, 'C'),
  (3, 2, 'A');

-- ---------- 3. Queries ----------

-- Query 1: all courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses ON courses.id = enrolments.course_id
WHERE students.name = 'Amina Otieno';

-- Query 2: all students on one course
SELECT students.name, students.email
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students ON students.id = enrolments.student_id
WHERE courses.title = 'Web Foundations';

-- Query 3: number of students per course
-- LEFT JOIN keeps courses even if they have zero students
SELECT courses.title, COUNT(enrolments.id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;

-- Query 4: students who have no enrolments
-- LEFT JOIN, then keep only rows where no enrolment matched
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.id IS NULL;

-- Query 5: update one enrolment's grade
-- Brian Kamau's grade on Web Foundations changes from B to A
UPDATE enrolments
SET grade = 'A'
WHERE student_id = 2 AND course_id = 1;

-- Check that the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses ON courses.id = enrolments.course_id
WHERE enrolments.student_id = 2 AND enrolments.course_id = 1;
