# TicketHub Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part design framework: requirements, estimates, API, data model, architecture and trade-offs. It also explains how the design prevents two people from buying the same seat.

## 1. Requirements

### Functional requirements

- Users can register, log in and browse upcoming events.
- Users can see the seat map for an event, with each seat's price and availability.
- Users can select seats and hold them for a short time while they pay.
- Users can pay and receive tickets with a unique code.
- Users can view their orders and tickets.
- **A seat can never be sold to two people.**

### Non-functional requirements

- **Correctness:** no double sales, even when thousands of people click the same seat at the same moment. This matters more than speed.
- **Availability:** 99.9% uptime, and no single point of failure, especially during a big sale.
- **Latency:** browsing pages load in under 200 ms. Seat holds respond in under 500 ms, even during a sale.
- **Scalability:** survives a sale where 200,000 people compete for 20,000 seats in 10 minutes.
- **Durability:** a paid ticket is never lost.
- **Fairness:** during a sale, people are admitted in the order they arrived.
- **Security:** HTTPS only, hashed passwords, and users can only see their own orders.

## 2. Estimates

Assumptions: 2,000,000 registered users. One day is rounded to 100,000 seconds, and peak traffic is 5 times the average. A ticket and its order take about 1 KB.

### Normal day

| Item | Working | Result |
|------|---------|--------|
| Page views per day | 50,000 visitors × 10 pages | 500,000 |
| **Reads per second** | 500,000 ÷ 100,000 | **5 average, 25 peak** |
| Purchases per day | given | 5,000 |
| **Writes per second** | 5,000 ÷ 100,000 | **0.05 average, about 0.25 peak** |
| Read to write ratio | 500,000 ÷ 5,000 | **100 to 1 (read-heavy)** |
| **Storage per year** | 5,000 × 1 KB × 365 | **about 1.8 GB** |

On a normal day the load is tiny. One small database and two app servers would cope easily.

### Popular concert on sale

200,000 people try to buy 20,000 seats within the first 10 minutes (600 seconds). I assume each person makes about 10 requests (loading the page, refreshing the seat map, selecting seats and checking out) and about 2 seat-hold attempts.

| Item | Working | Result |
|------|---------|--------|
| Users arriving | 200,000 ÷ 600 | **about 333 per second** |
| **Requests per second** | 200,000 × 10 ÷ 600 | **about 3,300 average, up to 10,000 in the first seconds** |
| **Seat-hold attempts (writes)** | 200,000 × 2 ÷ 600 | **about 670 per second** |
| Completed purchases | 20,000 ÷ 600 | **at most 33 per second** |
| Competition | 200,000 ÷ 20,000 | **10 buyers for every seat** |

**What this tells us:** the sale is more than 100 times the normal peak of 25 requests per second, but it lasts only minutes. The data is small (20,000 seats), so storage is no problem. The real challenges are the sudden traffic spike and **contention**: many people fighting over the same few rows. We should not build for the spike all year round. We should absorb it with a waiting room and a cache, and let the database decide who gets each seat.

## 3. API

Base URL: `https://api.tickethub.com/v1`. All bodies are JSON. Every endpoint except login and the event lists needs `Authorization: Bearer <token>`.

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/auth/login` | Log in and receive a token | 200 OK |
| 2 | GET | `/events` | List upcoming events | 200 OK |
| 3 | GET | `/events/{id}` | Get one event's details | 200 OK |
| 4 | GET | `/events/{id}/seats` | Get the seat map with each seat's status | 200 OK |
| 5 | POST | `/events/{id}/holds` | Hold one or more seats for 5 minutes | 201 Created |
| 6 | DELETE | `/holds/{id}` | Release a hold | 204 No Content |
| 7 | POST | `/orders` | Pay for held seats and create the order and tickets | 201 Created |
| 8 | GET | `/orders/{id}` | Get an order and its tickets | 200 OK |

### Hold seats: `POST /events/12/holds`

```json
{ "seatIds": [301, 302] }
```

Response `201 Created`:

```json
{
  "holdId": 88,
  "seatIds": [301, 302],
  "expiresAt": "2026-10-20T10:05:00Z"
}
```

### Checkout: `POST /orders`

The `Idempotency-Key` header makes a retried request safe, so a double click can never charge twice.

```json
{ "holdId": 88, "paymentToken": "tok_abc123" }
```

Response `201 Created`:

```json
{
  "orderId": 5001,
  "status": "paid",
  "tickets": [
    { "code": "TH-9F2A71", "seatId": 301 },
    { "code": "TH-9F2A72", "seatId": 302 }
  ]
}
```

### Errors

- **400 Bad Request:** invalid body, for example an empty `seatIds`.
- **401 Unauthorized:** missing or invalid token.
- **404 Not Found:** the event or hold does not exist.
- **409 Conflict:** the seat is already taken or held by someone else. Body: `{ "error": { "code": 409, "message": "Seat 301 is no longer available." } }`
- **410 Gone:** the hold expired before checkout.
- **429 Too Many Requests:** rate limit exceeded.
- **503 Service Unavailable:** the sale is overloaded, and the user is sent to the waiting room.

## 4. Data model

Five tables: `users`, `events`, `seats`, `orders` and `tickets`.

- **One-to-many:** one event has many seats, one user has many orders, and one order has many tickets.
- **Seat to ticket:** each seat has at most one ticket, and a `UNIQUE` rule on `tickets.seat_id` enforces this.
- **Many-to-many:** users and events are many-to-many through orders and tickets. One user can buy tickets to many events, and an event has many buyers.

```sql
CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  venue        TEXT NOT NULL,
  starts_at    TEXT NOT NULL,
  total_seats  INTEGER NOT NULL
);

CREATE TABLE seats (
  id               INTEGER PRIMARY KEY,
  event_id         INTEGER NOT NULL,
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'held', 'sold')),
  held_by          INTEGER,
  hold_expires_at  TEXT,
  UNIQUE (event_id, section, row_label, seat_number),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (held_by)  REFERENCES users(id)
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL,
  total_cents      INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  idempotency_key  TEXT NOT NULL UNIQUE,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE tickets (
  id        INTEGER PRIMARY KEY,
  order_id  INTEGER NOT NULL,
  seat_id   INTEGER NOT NULL UNIQUE,   -- a seat can only ever have one ticket
  code      TEXT NOT NULL UNIQUE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);

CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**Indexes:** `seats(event_id, status)` serves the busiest query, "which seats are still available for this event?". `orders(user_id)` serves "show my orders". Both speed up reads at a small cost to writes, which is a good trade because reads outnumber writes 100 to 1 on a normal day.

## 5. Architecture

```
                         ┌─────────┐
          ┌─────────────>│   DNS   │  (tickethub.com -> IP addresses)
          │              └─────────┘
 ┌────────┴──────┐  static files, images  ┌───────────────────────┐
 │ Browser /     │ ─────────────────────> │ CDN                   │
 │ mobile client │                        └───────────────────────┘
 └────────┬──────┘
          │ API calls (HTTPS, JSON)
          v
   ┌───────────────┐
   │ Load balancer │  (health checks, rate limiting)
   └──────┬────────┘
          v
   ┌───────────────┐   admits N users per second
   │ Waiting room  │ - - - - - - - - - - - - - - -┐
   └──────┬────────┘                              │
     ┌────┴─────┬──────────┐                       │
     v          v          v                       │
 ┌───────┐  ┌───────┐  ┌───────┐        ┌───────────────┐
 │ App 1 │  │ App 2 │  │ App 3 │ ─────> │ Cache (Redis) │ seat map, event pages
 └───┬───┘  └───┬───┘  └───┬───┘        └───────────────┘
     │ holds    │ reads    │ jobs
     │ orders   │          │
     v          v          v
 ┌─────────┐ ┌──────────┐ ┌───────┐   ┌────────┐   ┌──────────────────┐
 │ Primary │>│ Read     │ │ Queue │──>│ Worker │──>│ Email, ticket    │
 │   DB    │ │ replica  │ └───────┘   └────────┘   │ PDF generation   │
 └─────────┘ └──────────┘                          └──────────────────┘
     ^
     │ app server <-> payment provider (card payments, external)

 Normal load: 5 reads/s (25 peak), about 0.05 purchases/s.
 Sale: about 3,300 requests/s (up to 10,000), 670 hold attempts/s, 20,000 seats.
```

### What each component does

- **Client (browser or app):** shows events and the seat map and sends API requests, so people can buy from any device.
- **DNS:** turns `tickethub.com` into an IP address so users can find the site by name.
- **CDN:** serves images, CSS and JavaScript from edge servers near users, which cuts latency and keeps static traffic off our servers during a sale.
- **Load balancer:** spreads requests across the app servers, skips unhealthy ones, and applies rate limits so one buggy script cannot flood the system.
- **Waiting room:** during a sale, holds extra users in a first-come, first-served virtual queue and lets in only as many as the system can safely handle, so the spike cannot crush the database.
- **App servers (three or more):** run the API code (browsing, holds, checkout). They are stateless, so we can add servers before a big sale and remove them afterwards.
- **Cache (Redis):** keeps event pages and the seat map in memory with a very short expiry, so thousands of people can look at the seat map without touching the database.
- **Primary database:** the single source of truth for seat status. It is the one place that decides who gets a seat, so the data stays correct.
- **Read replica:** answers browsing queries and provides a spare copy that can be promoted if the primary fails.
- **Message queue:** holds slow jobs, such as sending confirmation emails and generating ticket PDFs, so checkout can reply immediately.
- **Worker:** takes jobs from the queue and runs them in the background, so slow work never delays a purchase.
- **Payment provider:** a trusted external service that handles card payments, so we never store card numbers.

## 6. How the design prevents selling the same seat twice

Two people clicking the same seat at the same moment is the central danger. A naive version of the code would read the seat, see "available", and then write "sold". If two requests both read "available" before either writes, both succeed and the seat is sold twice. We prevent this with four layers, from the main defence to the last resort.

**1. An atomic, conditional update (the main defence).** Holding a seat is a single SQL statement that checks and changes the seat in one step:

```text
UPDATE seats
SET status = 'held', held_by = :user_id,
    hold_expires_at = datetime('now', '+5 minutes')
WHERE id = :seat_id
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));
```

The database lets only one statement change a given row at a time. The first request changes the row, and the second then sees `status = 'held'`, so its `WHERE` clause matches nothing. The app checks how many rows changed. **One row means the user got the seat. Zero rows means someone else got it first, so the app returns `409 Conflict`.** The check and the write cannot be separated, so there is no gap for a second buyer to slip into.

**2. Time-limited holds.** A held seat belongs to one user for 5 minutes while they pay. If they abandon the checkout, the hold expires and the seat becomes available again. Expired holds are also treated as available by the query above, so there is no dependence on a cleanup job running on time.

**3. Checkout in one transaction.** Creating the order, creating the tickets and marking seats as `sold` happen inside a single database transaction, and only if the seats are still held by this user and have not expired. If any step fails, everything is rolled back, and no one is charged for a seat they do not get. The `Idempotency-Key` on the order stops a double click or a retried request from creating two orders.

**4. A database rule as the last line of defence.** `tickets.seat_id` is `UNIQUE`. Even if there were a bug in the application code, the database would refuse to create a second ticket for the same seat. Rules inside the database apply to every server and every version of the code.

**Why not use only the cache?** The Redis seat map may be a second or two out of date, so it is used only for **display**. If the map shows a seat as free but someone just took it, the hold request fails with a 409, and the user picks another seat. The database always has the final say.

## 7. Trade-offs

### Speed versus freshness (the cached seat map)

Caching the seat map for 1 to 2 seconds lets thousands of people browse without hitting the database, but it can show a seat as free when it was just taken. We accept some 409 errors, because the database check protects correctness, and a slightly outdated map is better than an overloaded database that fails for everyone.

### Correctness versus availability (the seat inventory)

All holds and purchases go through the single primary database, because only one place can safely decide who owns a seat. The downside is that the primary is the busiest part of the system and writes cannot be spread over replicas. If it fails, we promote the replica, and we accept a short period where buying is paused rather than risk selling a seat twice. At 670 hold attempts per second, one well-tuned primary can handle this, so we do not need sharding.

### Fairness and protection versus convenience (the waiting room)

The waiting room protects the system and treats people in arrival order, but some users wait several minutes for a turn. Without it, the site would likely crash for everyone. We accept the wait because a controlled queue is better than an outage.

### Cost versus reliability

Normal traffic needs only two small app servers, but a sale needs many more. Running that capacity all year would waste money, so we scale up shortly before announced sales and back down afterwards. The risk is a surprise spike, which the waiting room and rate limiting soften.

## 8. Single points of failure

| Part | If it fails | How we avoid a total outage |
|------|-------------|-----------------------------|
| App server | Requests to it fail | Several stateless servers behind a load balancer. Health checks remove a dead one, and clients retry. |
| Load balancer | No traffic gets through | Use a managed load balancer that runs on several machines. |
| Primary database | Holds and purchases stop | Promote the read replica (failover), and keep nightly backups. |
| Cache | Pages are slower | The app reads from the database instead (graceful degradation), and the waiting room limits the load. |
| Queue or worker | Emails and PDFs are delayed | Jobs wait safely in the queue and run when a worker restarts. Purchases still succeed. |
| Payment provider | Checkout fails | Holds stay valid for 5 minutes so users can retry, and the user sees a clear error instead of being charged twice. |
