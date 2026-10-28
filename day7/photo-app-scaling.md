# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow. This plan estimates the load and designs a system that can handle it.

## 1. Assumptions

- 10,000,000 registered users.
- 10% are active on a given day.
- Each active user uploads 1 photo per day.
- Each active user views 50 feed pages per day.
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- Busy hours are about 5 times the average load.
- One day is rounded to 100,000 seconds to keep the maths simple.

Daily active users (DAU): 10,000,000 × 10% = **1,000,000**.

## 2. Estimates

### Uploads per second

- Uploads per day: 1,000,000 × 1 = 1,000,000.
- Average: 1,000,000 ÷ 100,000 = **10 uploads per second**.
- Peak: 10 × 5 = **50 uploads per second**.

### Feed views per second

- Feed views per day: 1,000,000 × 50 = 50,000,000.
- Average: 50,000,000 ÷ 100,000 = **500 feed views per second**.
- Peak: 500 × 5 = **2,500 feed views per second**.

### Storage per year

- Original photos: 1,000,000 × 2 MB = 2 TB per day, so 2 TB × 365 = **730 TB per year**.
- Thumbnails: 1,000,000 × 50 KB = 50 GB per day, so 50 GB × 365 = **about 18 TB per year**.
- Total photo storage: **about 748 TB per year (roughly 0.75 PB)**.
- Database metadata (about 1 KB per photo row): 1 GB per day, so about **365 GB per year**.

### Upload bandwidth

- Average: 10 uploads/s × 2 MB = 20 MB/s. Peak: 50 × 2 MB = 100 MB/s.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 500 feed views per second against 10 uploads per second, a ratio of **50 to 1**.

What this means for the design:

- Caching feeds will remove most of the load from the database.
- Read replicas can handle feed queries, while one primary handles the few writes.
- A CDN should serve photos and thumbnails, because most traffic is people looking at images.
- Writes are rare, so the upload path can afford extra steps such as validation and background processing.

## 4. Why photos are not stored in the database

- The photos total about 748 TB a year, which would make the database enormous, slow and expensive to back up and replicate.
- Databases are built for small structured rows, not large binary files.
- Every feed query would compete with heavy file reads.
- Object storage is cheaper per gigabyte, scales almost without limit and is designed for large files.

Photos go in **object storage** (such as Amazon S3). The database stores only the **URL** of each file together with its metadata (owner, caption, time, status).

## 5. Architecture diagram
┌──────────────┐ ┌─────────┐
│ Browser / │──────> │ DNS │ (snapshare.com -> IP addresses)
│ mobile app │ └─────────┘
└──────┬───────┘
│ photos, thumbnails, CSS, JS
├────────────────────────────> ┌─────────────────┐
│ │ CDN (edge │ <──(miss only)── Object storage
│ │ servers) │
│ └─────────────────┘
│ API calls (HTTPS, JSON)
v
┌───────────────┐
│ Load balancer │ (health checks)
└───────┬───────┘
┌────┴─────┬──────────┐
v v v
┌───────┐ ┌───────┐ ┌───────┐ ┌───────────────┐
│ App 1 │ │ App 2 │ │ App 3 │ ─────> │ Cache (Redis) │ feed:user:ID
└───┬───┘ └───┬───┘ └───┬───┘ └───────────────┘
│ writes │ reads │ jobs
v v v
┌─────────┐ ┌──────────┐ ┌───────┐ ┌────────┐
│ Primary │>│ Read │ │ Queue │──>│ Worker │ makes thumbnails
│ DB │ │ replica │ └───────┘ └───┬────┘
└─────────┘ └──────────┘ │ reads original,
│ writes thumbnail
v
┌─────────────────────┐
│ Object storage │
│ (originals + thumbs)│
└─────────────────────┘

## 6. What each component does

- **DNS:** turns snapshare.com into the IP address of the CDN or load balancer, so users can find the app by name.
- **CDN:** keeps copies of photos, thumbnails and static files on edge servers near users, which cuts latency and takes load off our own servers.
- **Load balancer:** spreads requests across the app servers and skips unhealthy ones, so no single server is overloaded and one crash does not cause an outage.
- **App servers:** run the API code (login, upload, feed). They are stateless, so we can add more of them when traffic grows.
- **Cache (Redis):** stores each user's recent feed in memory, so most feed views are answered in about 1 ms without touching the database.
- **Primary database:** the single place that accepts writes, such as new photo records and follows, so the data stays correct.
- **Read replica:** a copy of the primary that answers feed queries, which spreads the heavy read traffic away from the primary.
- **Object storage:** stores the photo files (about 748 TB a year) cheaply and durably, which keeps them out of the database.
- **Message queue:** holds thumbnail jobs so the app server can reply to the user immediately instead of waiting for image processing.
- **Worker:** takes jobs from the queue, creates the 50 KB thumbnail and saves it, so slow image processing happens in the background.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps Upload.
2. The request goes through DNS and the load balancer to a healthy app server.
3. The app server checks the login token and validates the request (file type, size limit such as 10 MB).
4. The app server inserts a row in the **primary database** with the owner, caption, time and status `processing`. It then asks object storage for a temporary upload link.
5. The app server returns that link, and the client uploads the 2 MB file **directly to object storage**. This keeps large files off the app servers.
6. When the upload finishes, the app server puts a **"create thumbnail" job** on the queue (containing the photo id and the file location) and replies to the user with `201 Created`. The user sees "Uploaded" immediately.
7. A **worker** takes the job, downloads the original, creates a 50 KB thumbnail and saves it to object storage.
8. The worker updates the database row: it adds the thumbnail URL and changes the status to `ready`.
9. The app deletes the cached feeds that should now show the photo (for example, the uploader's own feed), so the next read is fresh. Followers' feeds pick it up when their cache expires.
10. Later, when a follower loads the feed, the thumbnail is fetched from the nearest **CDN** edge server.

If the worker crashes, the job stays in the queue and is retried, so the thumbnail is still created.

## 8. Trade-offs

### Speed versus freshness (cache and replica)

Caching feeds in Redis with a short TTL (for example 60 seconds) makes feeds load in about 1 ms, but a follower may not see a new photo for up to a minute. The read replica can also lag the primary by a few milliseconds. This is acceptable for a photo feed, where a one-minute delay harms nobody. It would not be acceptable for something like a bank balance.

### Fast uploads versus instant thumbnails (queue)

Creating thumbnails in the background keeps uploads fast and protects the servers from spikes, but a new photo may briefly show a placeholder instead of its thumbnail until the worker finishes. We accept this small delay in exchange for a responsive app that does not fail under heavy upload load.

### Cost versus reliability

Extra app servers, a read replica and replicated object storage make SnapShare more reliable and faster, but each one costs money. We start with 3 app servers and one replica, and add more only when monitoring shows they are needed.

### Simplicity versus scalability

Direct-to-storage uploads keep the app servers light, but they are more complex than letting the server receive the file: the client needs a temporary link, and we must handle uploads that start but never finish. At 2 MB per photo and 100 MB/s peak bandwidth, the extra complexity is justified.
