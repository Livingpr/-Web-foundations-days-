# Library API Design

A REST API for a library's `books` resource. The resource name is a plural noun, the HTTP method says what to do, and a specific book is addressed by its id.

Base URL: `https://api.library.example.com`

## Book object

Fields: `id` (number, set by the server), `title` (string), `author` (string), `isbn` (string), `year` (number), `available` (boolean).

## Endpoints

### 1. List all books

- **Method:** GET
- **Path:** `/books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** 200 OK

### 2. Get one book

- **Method:** GET
- **Path:** `/books/42`
- **Description:** Returns the book with id 42.
- **Request body:** none
- **Success status:** 200 OK

### 3. Create a book

- **Method:** POST
- **Path:** `/books`
- **Description:** Adds a new book; the server assigns the id.
- **Example request body:** `{ "title": "Things Fall Apart", "author": "Chinua Achebe", "isbn": "9780385474542", "year": 1958 }`
- **Success status:** 201 Created

### 4. Replace a book

- **Method:** PUT
- **Path:** `/books/42`
- **Description:** Replaces book 42 completely with the version sent.
- **Example request body:** `{ "title": "Things Fall Apart", "author": "Chinua Achebe", "isbn": "9780385474542", "year": 1958, "available": true }`
- **Success status:** 200 OK

### 5. Update part of a book

- **Method:** PATCH
- **Path:** `/books/42`
- **Description:** Changes only the fields sent, for example marking a book as borrowed.
- **Example request body:** `{ "available": false }`
- **Success status:** 200 OK

### 6. Delete a book

- **Method:** DELETE
- **Path:** `/books/42`
- **Description:** Removes book 42 from the library.
- **Request body:** none
- **Success status:** 204 No Content

### 7. List books by an author

- **Method:** GET
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the given author, using a query parameter.
- **Request body:** none
- **Success status:** 200 OK (an empty list `[]` if the author has no books)

## Error codes

### 400 Bad Request

The request itself is invalid, so the server rejects it before doing any work.

- **Example:** `POST /books` with the body `{ "title": "", "year": "nineteen" }` is rejected because the title is empty, the author is missing and the year is not a number.
- **Example:** `PATCH /books/42` with a body that is not valid JSON.

### 404 Not Found

The requested book or URL does not exist.

- **Example:** `GET /books/9999` when no book has id 9999.
- **Example:** `DELETE /books/9999` for a book that was already deleted.

## Notes

- All request and response bodies use JSON with the header `Content-Type: application/json`.
- Write operations (POST, PUT, PATCH, DELETE) would require an `Authorization: Bearer <token>` header; a missing or invalid token returns 401.
