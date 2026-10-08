# Deploying Bagstreet

How to run Bagstreet in production on one DigitalOcean droplet with Docker Compose, Caddy and DigitalOcean Spaces.

The files referred to here live in [`deploy/`](../deploy):

| File | What it is |
|---|---|
| `deploy/docker-compose.prod.yml` | The production stack |
| `deploy/Dockerfile.api` | API server image (Bun) |
| `deploy/Dockerfile.web` | Storefront and admin builds, served by Caddy |
| `deploy/Caddyfile` | HTTPS, static sites and the API proxy |
| `deploy/.env.production.example` | Every setting, with comments |
| `.github/workflows/images.yml` | Builds both images on GitHub and pushes them to GitHub Container Registry |

> **Tested so far.** Before this guide was written, the full stack was built and run locally from an empty database: migrations, health checks, HTTPS through Caddy, CORS, and the rate-limit IP check in [Step 8](#8-verify-before-launch). Nothing has yet been deployed to a real droplet or a real Space, so follow the verification steps the first time.

---

## The shape of it

```
                         ┌─────────────── DigitalOcean droplet ────────────────┐
 customers ──HTTPS──▶ Caddy :443 ──▶ storefront (static)                        │
 staff     ──HTTPS──▶      │     ──▶ admin      (static)                        │
                           └─────▶ api:3000 (Bun) ──▶ postgres, redis           │
                         └──────────────────────────────┬──────────────────────┘
                                                        │ uploads (S3 API)
 browsers ──HTTPS──▶ Spaces CDN edge ◀── Space "bagstreet-media" (private, no listing)
                     (product & campaign images)
```

| Domain | Served by |
|---|---|
| `example.co.ke` | Storefront (`www.` redirects here) |
| `admin.example.co.ke` | Admin dashboard |
| `api.example.co.ke` | API |
| `bagstreet-media.fra1.cdn.digitaloceanspaces.com`, or your own `media.example.co.ke` | Images, from the Spaces CDN |

Only Caddy is reachable from the internet. Postgres, Redis and the API sit on the internal Docker network with no published ports.

---

## Decisions

### Caddy, not nginx
- **Certificates are automatic.** Caddy obtains and renews Let's Encrypt certificates itself. Nginx needs certbot, a cron job, and reload hooks.
- **The whole config is about 70 lines** ([`deploy/Caddyfile`](../deploy/Caddyfile)), and it has HTTP/3 and sensible TLS defaults built in.
- **Its default `X-Forwarded-For` handling is safe.** It replaces the header with the real client IP unless the request comes from a proxy you've told it to trust. Rate limiting depends on this; see [`TRUST_PROXY_HOPS`](#trust_proxy_hops).
- Nginx would work too, but you'd have to get each of those right by hand.

### DigitalOcean Spaces for images, not self-hosted MinIO
- **MinIO no longer publishes downloadable images.** As of late 2025, `minio/minio` on Docker Hub refuses pulls, including pinned releases, and the `quay.io` and Bitnami images are gone. A fresh droplet can't install it the usual way. Building MinIO from source is possible, but then you build and patch it yourselves.
- **Spaces is S3-compatible,** so the existing upload code works with configuration changes only. It costs about **$5/month for 250 GiB of storage plus 1 TiB of transfer**, and includes a CDN. There's no storage server to run, secure or back up.
- **Local development is unchanged.** MinIO keeps running from `docker-compose.yml`, using the copy already on your machine.

### One droplet with Docker Compose
- Right-sized for launch: the measured peak is about half of the $12 droplet's memory. Every service has a health check and restarts automatically.
- To grow, resize the droplet, or move Postgres to DigitalOcean Managed Postgres. Nothing in the app assumes a single machine except the in-memory fallback for the rate limiter, which isn't used because Redis is.

---

## Sizing: starting on the $12 droplet

**Plan:** start on **Basic Regular, 1 vCPU / 2 GB RAM / 50 GB SSD (about $12/month)**, and move up as revenue grows ([when to upgrade](#when-to-upgrade)).

### Measured memory
Measured on the production stack itself (`deploy/docker-compose.prod.yml`), running locally:

| Service | Idle (measured) |
|---|---|
| API (Bun) | 69 MB |
| Postgres (empty) | 34 MB |
| Redis REST bridge | 55 MB |
| Redis | 6 MB |
| Caddy | 15 MB |
| **Whole stack** | **≈ 180 MB** |

- **There's no message broker.** RabbitMQ used to take about 90 MB; emails now go through a Postgres outbox table ([Email delivery](#email-delivery)).
- **Peak while two admins upload full-size 12-megapixel phone photos at once:** the API rose to **≈ 310 MB**, about 240 MB above idle.
- **Add 300–450 MB for the OS and Docker,** plus a few hundred MB as Postgres caches a growing database.
- **Realistic peak ≈ 1.0–1.2 GB of 2 GB.** The stack fits comfortably.

### The one rule on a 2 GB droplet: don't build on it
Building the images (dependency install, TypeScript, Vite) needs about another 1–1.5 GB and is slow on one CPU. So:
- **GitHub Actions builds the images** (`.github/workflows/images.yml`) and pushes them to GitHub Container Registry.
- **The droplet only pulls them** (`docker compose pull`).
- **Image sizes:** the API image is about 250 MB (production dependencies only) and the web image about 66 MB. GitHub's free plan includes 500 MB of private package storage, so delete old versions now and then (Packages → each image → Manage versions), or make the packages public. They contain no secrets: all configuration comes from `.env.production` at runtime.
- **Add a 2 GB swap file anyway** ([Step 2](#2-harden-the-server)). It's a safety net against an unusual spike, not something the stack should rely on.

### Storage for images (Spaces, not the droplet)
Measured on the current catalogue: one uploaded photo is stored in three WebP sizes, about **125 KB** in total (thumbnail 4 KB, medium 48 KB, large 72 KB). Full-resolution phone photos will be larger, so budget **150–350 KB per photo**.

| Catalogue | Photos (4 per product) | Space used |
|---|---|---|
| 200 products | 800 | ≈ 0.1–0.3 GB |
| 1,000 products | 4,000 | ≈ 0.6–1.4 GB |
| 10,000 products | 40,000 | ≈ 6–14 GB |

The 250 GiB included with Spaces will last a long time. **The droplet's disk doesn't hold images.**

### Droplet disk (50 GB)
| Item | Space |
|---|---|
| OS | ~5 GB |
| Pulled images | ~0.5 GB per release; prune old ones |
| Postgres | under 1 GB in year one (50,000 orders with their history is still under 1 GB) |
| Logs | capped by the compose file at 10 MB × 5 files per service |
| Local backups | small |

### Transfer
- A product page is about 0.5–0.7 MB of images. The 1 TiB of Spaces transfer covers roughly **1.5 million image-heavy page views a month**.
- The droplet's own transfer allowance (2 TB on this size) covers the API and static files many times over.

### Starting budget
Prices are approximate as of 2025; check DigitalOcean's pricing page.

| | Spec | Approx. monthly |
|---|---|---|
| **Droplet** | Basic Regular, 1 vCPU / 2 GB / 50 GB SSD, Ubuntu 24.04 LTS | ~$12 |
| Block Storage volume | 10 GiB at `/mnt/bagstreet` for Postgres data and backups | ~$1 |
| Spaces with CDN | 250 GiB + 1 TiB transfer | ~$5 |
| Droplet backups | weekly | ~$2.40 |
| **Total** | | **≈ $20/month** |

**Why use a separate volume for Postgres?** It survives rebuilding or resizing the droplet, and you can snapshot it on its own. You can grow it later without downtime.

**Region:** DigitalOcean has no African region. Put the droplet and the Space in the **same** region, and pick FRA1, AMS3 or LON1 by testing latency from Kenya (DigitalOcean's speed-test pages are a quick way to do this). With the CDN, images are served from edge locations anyway, so the droplet's region mostly affects API response times.

### When to upgrade
Move up when any of these hold for a week or more, not on a single spike:

| Signal | Where to see it |
|---|---|
| Memory regularly above 75%, or swap in use | DigitalOcean monitoring graph |
| CPU regularly above 70% | DigitalOcean monitoring graph |
| Checkout or admin pages feel slow at busy times | You and your customers |
| Disk above 70% | `df -h`, monitoring alert |

**How to upgrade:**
1. Power off the droplet.
2. Resize it in the DigitalOcean panel. Choose **"CPU and RAM only"**: that resize can be reversed, while growing the disk can't.
3. Power it back on. Downtime is a few minutes, and Docker restarts everything automatically.

The natural next step is 2 vCPU / 4 GB (~$24/month). On that size you could also build images on the server, though CI is still nicer.

## CDN

There are two layers. The first is needed from day one; the second is optional.

### 1. Images: the Spaces CDN (required)
- **Turn the CDN on** in the Space's settings. Images are then served from DigitalOcean's edge servers rather than from the Space itself.
- **Cache settings:** every image is uploaded with `Cache-Control: public, max-age=31536000, immutable`, so edges and browsers keep it for a year.
- **No cache purging is ever needed.** File names are random UUIDs, and a new or replaced photo always gets a new URL.
- **Choose the final image URL before launch.** The full image URL (`STORAGE_PUBLIC_URL` + file name) is stored in the database for each product, so changing the CDN address later means a SQL update to rewrite stored URLs. Two options:
  - **Recommended:** a custom subdomain such as `https://media.example.co.ke`. Add it under the Space's CDN settings; DigitalOcean issues the certificate if the domain's DNS is managed by DigitalOcean. You can then change CDN provider later without touching stored URLs.
  - **Or:** the default `https://<space>.<region>.cdn.digitaloceanspaces.com`.
- **Deleted images:** when an image is replaced or a product removed, the app deletes it from the Space, but edge copies can linger until they expire. That's fine for normal use. For an urgent takedown (for example a copyright complaint), purge the file in the Space's CDN settings.

### 2. Optional: Cloudflare in front of Caddy (storefront and API)
**Why:** Cloudflare has edge locations in Nairobi and Mombasa. It would cache the storefront's JavaScript, CSS and static images close to customers, and add DDoS protection. The free plan is enough.

How to set it up:
1. Move DNS to Cloudflare and turn the orange-cloud proxy on for `example.co.ke`, `admin.` and `api.`.
2. Set SSL/TLS mode to **Full (strict)**. Caddy keeps its Let's Encrypt certificates.
3. **Caching:** the hashed files under `/assets/*` are already marked immutable, and `index.html` is `no-cache`, so Cloudflare's defaults behave correctly. **Don't add "cache everything" rules for `api.`**: the API is dynamic and per-user.
4. **The IP chain changes.** You must update Caddy and `TRUST_PROXY_HOPS`, as described [below](#with-cloudflare-in-front).

**Don't add Cloudflare in front of the Spaces CDN.** That would be two CDNs in a row.

---

## Securing images

| Layer | What protects it |
|---|---|
| **No listing** | Create the Space with **File Listing: Restricted**. Each image is individually public (`STORAGE_OBJECT_ACL=public-read`), but nobody can list the Space to discover files. Names are random UUIDs, so they can't be guessed. |
| **Scoped key** | Create a **limited-access Spaces key** for this one Space with Read/Write/Delete. Even if the API server leaked it, no other Space and nothing else on the account would be exposed. |
| **Uploads only through the API** | Only signed-in admins can upload, via the API. The Space accepts no anonymous writes. |
| **Re-encoding strips payloads** | Every upload is decoded and re-encoded to WebP by `sharp`. This throws away EXIF/GPS metadata and anything hidden in the original file, and SVG and other non-image types are rejected. |
| **Correct content type** | Images are stored as `image/webp` with long-lived cache headers. |
| **The API's own limits** | API requests are capped at 10 MB, and Caddy caps uploads at 16 MB. |

> **Known mismatch:** the upload code accepts images up to 15 MB, but the API's request limit is 10 MB, so photos between 10 and 15 MB fail. That's rare with phone photos (usually 2–5 MB). Raise the limit in `server/src/index.ts` if it causes problems.

**Check after setup.** Both of these should return **403**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://bagstreet-media.fra1.digitaloceanspaces.com/
curl -s -o /dev/null -w '%{http_code}\n' "https://bagstreet-media.fra1.digitaloceanspaces.com/?list-type=2"
```

---

## `TRUST_PROXY_HOPS`

The API uses the client's IP address for rate limits: 10 login attempts per 15 minutes, 10 orders per hour per network, and so on. Clients can forge `X-Forwarded-For`, so the API only trusts entries added by **proxies you control**, counted from the right of the header.

| Setup | `TRUST_PROXY_HOPS` | Why |
|---|---|---|
| Local development (no proxy) | `0` | The header is ignored and the socket address is used. |
| **Production: Caddy only** | **`1`** | Caddy overwrites `X-Forwarded-For` with the real client IP, because untrusted clients' headers are replaced. That single entry is the client. **This is the default in the compose file.** |
| Cloudflare → Caddy → API | `2` | See below. |

**This only works if the API is unreachable except through Caddy.** In the compose file the `api` service has **no `ports:`**; keep it that way. If port 3000 were reachable from the internet, a client could send their own `X-Forwarded-For` straight to the API and choose their own IP.

Also, Docker-published ports **bypass `ufw`**, so a firewall rule won't save you; the only safe rule is not publishing the port.

### With Cloudflare in front
Caddy has to be told to trust Cloudflare's IP ranges, so it keeps Cloudflare's header and appends Cloudflare's address. In the global options block of the `Caddyfile`:

```caddy
{
	email {$ACME_EMAIL}
	servers {
		# Paste every IPv4 and IPv6 range from https://www.cloudflare.com/ips/, space-separated.
		# Cloudflare changes these occasionally; re-check when you update the server.
		trusted_proxies static <cloudflare ranges>
	}
}
```

The Caddyfile is built into the web image, so commit the change and tag a release; CI builds a new image. Then, on the droplet, set the new `IMAGE_TAG` and `TRUST_PROXY_HOPS=2` in `.env.production`, and run `$C pull && $C up -d`. **Run the IP check in [Step 8](#8-verify-before-launch) again afterwards.**

---

## Step by step

### 1. Create the DigitalOcean resources
1. **Droplet:** Ubuntu 24.04 LTS, 1 vCPU / 2 GB ([sizing](#sizing-starting-on-the-12-droplet)), **SSH key login only**, monitoring enabled, weekly backups enabled.
2. **Block Storage volume:** 10 GiB in the same region, attached to the droplet and mounted at `/mnt/bagstreet`. Add it to `/etc/fstab` as the DigitalOcean panel shows.
3. **Space:** `bagstreet-media` in the same region, with **CDN enabled** and **File Listing: Restricted**. Optionally add a custom CDN subdomain such as `media.example.co.ke`.
4. **Spaces key:** a limited-access key, Read/Write/Delete on `bagstreet-media` only.
5. **A second, private Space for backups:** `bagstreet-backups`, with its own key.
6. **DNS:** `A` records for `example.co.ke`, `www`, `admin` and `api`, all pointing to the droplet IP.

### 2. Harden the server
```bash
adduser deploy && usermod -aG sudo deploy        # then log in as deploy
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
sudo apt update && sudo apt install -y unattended-upgrades fail2ban
```
In `/etc/ssh/sshd_config`, set `PermitRootLogin no` and `PasswordAuthentication no`, then restart `ssh`.

Add a 2 GB swap file as a safety net:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system
```

### 3. Install Docker
Follow Docker's official instructions for Ubuntu (the `apt` repository method), which installs Docker Engine and the `docker compose` plugin. Then:
```bash
sudo usermod -aG docker deploy   # log out and back in
```
Then let the droplet pull your private images. Create a GitHub personal access token (classic) with **only `read:packages`**, and log in once:
```bash
docker login ghcr.io -u markmumba    # paste the token as the password
```
Skip this step if you made the packages public.

### 4. Get the code and configure it
```bash
git clone git@github.com:markmumba/bagstreet-ecommerce.git ~/bagstreet && cd ~/bagstreet
cp deploy/.env.production.example .env.production
chmod 600 .env.production
```
- Fill in `.env.production`. Generate every secret with `openssl rand -hex 32`.
- Use a GitHub **deploy key** (read-only) for the clone.
- `.env.production` is in `.gitignore`; **never commit it**.

### 5. Build the images, then pull, migrate and start
**On GitHub (once):**
1. Add a repository **variable** `API_DOMAIN` (e.g. `api.example.co.ke`) under Settings → Secrets and variables → Actions → Variables.
2. Push a release tag:
   ```bash
   git tag v1.0.0 && git push --tags
   ```
3. Wait for the **Build images** workflow to finish under the Actions tab.

**On the droplet** (set `IMAGE_TAG=v1.0.0` in `.env.production`):
```bash
C="docker compose -f deploy/docker-compose.prod.yml --env-file .env.production"
$C pull
$C up -d postgres redis redis-rest
$C run --rm api bun run server/src/scripts/migrate.ts     # creates/updates the schema
$C up -d
$C ps                                                     # everything "healthy" or "Up"
```
- Caddy gets the HTTPS certificates on first start, so DNS must already point at the droplet.
- **Never build on the 2 GB droplet.** Always `$C pull` first: `up` only falls back to building when an image is missing, which would run the droplet out of memory.

### 6. Create the first admin
```bash
$C run --rm -e ADMIN_EMAIL=you@example.co.ke -e ADMIN_PASSWORD='a long passphrase' api \
  bun run server/src/scripts/seed-admin.ts
```
Then sign in at `https://admin.example.co.ke` and invite other staff from the Users page.

### 7. Pesapal (production)
1. Register `https://api.example.co.ke/api/payments/pesapal/ipn` as the IPN URL in Pesapal.
2. Put the IPN id in `PESAPAL_IPN_ID`, and the production consumer key and secret in `.env.production`.
3. Run `$C up -d api` to restart with the new settings.
4. Place one small real order end to end.
5. In Admin → **Reconciliation**, import that day's Pesapal statement. It confirms the CSV columns are detected correctly and records the fee.

### 8. Verify before launch
- [ ] `curl https://api.example.co.ke/health/ready` reports `READY`, with the database `UP` and the rate-limit store `redis`.
- [ ] The storefront and admin load over HTTPS. `http://` and `www.` redirect.
- [ ] **The IP check.** The 11th request must return `429`. If every request gets `400`, the limiter is being fooled; check `TRUST_PROXY_HOPS` and make sure the API publishes no ports.
  ```bash
  for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'content-type: application/json' -H "X-Forwarded-For: 198.51.100.$i" -d '{}' https://api.example.co.ke/api/orders; done; echo
  ```
  This blocks **your own IP** from placing orders for an hour. To reset it:
  ```bash
  $C exec -T redis redis-cli --scan --pattern 'rl:order-placement:*' | xargs -r $C exec -T redis redis-cli del
  ```
- [ ] Upload a product photo in the admin. Its URL starts with `STORAGE_PUBLIC_URL` and loads in a private browser window.
- [ ] Both Space listing checks [above](#securing-images) return 403.
- [ ] Nothing except ports 22, 80 and 443 is open. From your laptop, `nmap -Pn <droplet-ip>` should show only those.

---

## Email delivery

Emails (order confirmations, staff alerts, password resets, invites, low stock) go through an **outbox table in Postgres**, `email_outbox`. There's no message broker.

- **Guaranteed with the change that causes them.** An email is written in the same database transaction as that change. When a payment is confirmed, marking the order paid, the ledger entry, and the customer and staff emails all commit together, or not at all.
- **A worker inside the API** sends due emails every 5 seconds, and immediately after new ones are queued. It retries failures after 1 min, 5 min, 15 min, 1 h and 6 h. **After 6 attempts the email is marked `FAILED`** and admins get an in-app alert.
- **Safe with more than one API instance:** emails are claimed with `FOR UPDATE SKIP LOCKED`.
- **Delivered at least once.** A crash between sending and recording means one duplicate email, never a lost one.
- **The same event can't queue twice,** thanks to dedupe keys like `order-confirmation:<order>`. Low-stock emails are limited to one "low" and one "out of stock" email per item, per admin, per day.
- **Retention:** sent rows are deleted after 30 days and failed ones after 90, because they contain customer details.

**Monitoring:** `/health/ready` includes `email_outbox` with `pending`, `failed`, `oldest_pending_seconds` and `backlog_warning`. `backlog_warning` is true when something has failed, or when the oldest pending email is more than 15 minutes old, which usually means the email provider is rejecting messages. To look at failures:

```bash
$C exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, job_type, recipient, attempts, last_error, created_at FROM email_outbox WHERE status = 'FAILED' ORDER BY id DESC LIMIT 20;"
```

Once the cause is fixed (for example, a wrong API key), resend them:

```bash
$C exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE email_outbox SET status = 'PENDING', attempts = 0, next_attempt_at = now() WHERE status = 'FAILED';"
```

## Backups

The database is the irreplaceable part. Images are in Spaces, which is replicated within its region.

Nightly Postgres dump, kept 14 days locally and copied to the private backups Space:
```bash
# /etc/cron.d/bagstreet-backup  (runs as deploy; install s3cmd and configure it with the backups key)
15 2 * * * deploy cd ~/bagstreet && docker compose -f deploy/docker-compose.prod.yml --env-file .env.production exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > /backups/bagstreet-$(date +\%F).dump && find /backups -name "*.dump" -mtime +14 -delete' && s3cmd sync --delete-removed /mnt/bagstreet/backups/ s3://bagstreet-backups/postgres/
```

- **Droplet backups don't include attached volumes.** Also take a volume snapshot, for example weekly.
- **Test a restore before launch, and once a quarter after that.** Restore into a scratch database with `pg_restore -d <scratch db> <dump>`.

---

## Deploying updates
1. **On your machine:** merge to `main`, then tag a release:
   ```bash
   git tag v1.1.0 && git push --tags
   ```
   GitHub Actions builds and pushes both images.
2. **On the droplet:**
   ```bash
   cd ~/bagstreet && git pull                     # updates deploy/ files and migrations
   sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=v1.1.0/' .env.production
   $C pull
   $C run --rm api bun run server/src/scripts/migrate.ts
   $C up -d          # recreates only containers whose image changed
   docker image prune -f
   ```
- **Rollback:** set `IMAGE_TAG` back to the previous release, then run `$C pull && $C up -d`. Migrations are forward-only, so if the release changed the schema, restore the dump taken before the deploy.
- **Take a backup before deploying a release with migrations.** Run the backup command by hand first.

## Monitoring
- **Uptime:** a DigitalOcean Uptime check on `https://api.example.co.ke/health/ready`, plus one on the storefront, with email or Slack alerts.
- **Resources:** DigitalOcean monitoring alerts at disk > 80%, memory > 85% and CPU > 80% sustained.
- **Email:** alert if `/health/ready` reports `email_outbox.backlog_warning: true`.
- **Logs:** `$C logs -f api`. They're size-capped, so they won't fill the disk.
- **Money:** open Admin → Reconciliation weekly. Payments "held for review" and "refund owed" also notify staff in the admin.

## Environment variables specific to production
The template [`deploy/.env.production.example`](../deploy/.env.production.example) explains every variable. The ones that differ from local development:

| Variable | Production value | Why |
|---|---|---|
| `TRUST_PROXY_HOPS` | `1` (`2` with Cloudflare) | Real client IPs for rate limits. See above. |
| `STORAGE_ENDPOINT`, `STORAGE_PORT`, `STORAGE_USE_SSL` | `fra1.digitaloceanspaces.com`, `443`, `true` | Spaces' S3 API |
| `STORAGE_REGION` | `us-east-1` | The signing region DigitalOcean documents for S3 clients. **If uploads fail with a signature error, try the Space's own region (e.g. `fra1`).** |
| `STORAGE_OBJECT_ACL` | `public-read` | Each image is public while the Space itself stays private. |
| `STORAGE_PUBLIC_URL` | the CDN URL | Stored in image URLs; [choose it before launch](#1-images-the-spaces-cdn-required). |
| `UNPAID_ORDER_TTL_MINUTES` | `45` | Releases stock held by abandoned checkouts. |
| `RUN_MIGRATIONS_ON_STARTUP` | `false` (set by compose) | Migrations run as an explicit step. |
| `PESAPAL_ENV` | `production` | |

**Storage settings are named `STORAGE_*`**, because production uses Spaces rather than MinIO. The old `MINIO_*` names are still read as a fallback, with a startup warning, so existing local `.env` files keep working. The `MINIO_ROOT_*` settings in the local `docker-compose.yml` configure the MinIO container itself and are unrelated.

The compose file sets `DATABASE_URL`, `SERVER_URL`, `STOREFRONT_URL`, `CLIENT_URL`, `CORS_ORIGIN`, `PESAPAL_CALLBACK_URL` and `REDIS_REST_URL` from the domains and credentials in `.env.production`, so they can't drift out of sync.
