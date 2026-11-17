# Deploying Bagstreet

How to run Bagstreet in production on one DigitalOcean droplet with Docker Compose and Caddy, with product images on Cloudflare R2.

The files referred to here live in [`deploy/`](../deploy):

| File | What it is |
|---|---|
| `deploy/docker-compose.prod.yml` | The production stack |
| `deploy/Dockerfile.api` | API server image (Bun) |
| `deploy/Dockerfile.web` | Storefront and admin builds, served by Caddy |
| `deploy/Caddyfile` | HTTPS, static sites and the API proxy |
| `deploy/.env.production.example` | Every setting, with comments |
| `.github/workflows/images.yml` | Builds both images on GitHub and pushes them to GitHub Container Registry |

> **Tested so far.** Before this guide was written, the full stack was built and run locally from an empty database: migrations, health checks, HTTPS through Caddy, CORS, and the rate-limit IP check in [Step 8](#8-verify-before-launch). Nothing has yet been deployed to a real droplet or a real R2 bucket, so follow the verification steps the first time.

---

## The shape of it

```
                         ┌─────────────── DigitalOcean droplet ────────────────┐
 customers ──HTTPS──▶ Caddy :443 ──▶ storefront (static)                        │
 staff     ──HTTPS──▶      │     ──▶ admin      (static)                        │
                           └─────▶ api:3000 (Bun) ──▶ postgres                  │
                         └──────────────────────────────┬──────────────────────┘
                                                        │ uploads (S3 API)
 browsers ──HTTPS──▶ Cloudflare edge ◀── R2 bucket "bagstreet-media" (custom domain only, no listing)
                     (product & campaign images, cached)
```

| Domain | Served by |
|---|---|
| `example.co.ke` | Storefront (`www.` redirects here) |
| `admin.example.co.ke` | Admin dashboard |
| `api.example.co.ke` | API |
| `media.example.co.ke` (the R2 bucket's custom domain) | Images, from Cloudflare R2 |

Only Caddy is reachable from the internet. Postgres and the API sit on the internal Docker network with no published ports.

---

## Decisions

### Caddy, not nginx
- **Certificates are automatic.** Caddy obtains and renews Let's Encrypt certificates itself. Nginx needs certbot, a cron job, and reload hooks.
- **The whole config is about 70 lines** ([`deploy/Caddyfile`](../deploy/Caddyfile)), and it has HTTP/3 and sensible TLS defaults built in.
- **Its default `X-Forwarded-For` handling is safe.** It replaces the header with the real client IP unless the request comes from a proxy you've told it to trust. Rate limiting depends on this; see [`TRUST_PROXY_HOPS`](#trust_proxy_hops).
- Nginx would work too, but you'd have to get each of those right by hand.

### Cloudflare R2 for images, not self-hosted MinIO or DigitalOcean Spaces
- **MinIO no longer publishes downloadable images.** As of late 2025, `minio/minio` on Docker Hub refuses pulls, including pinned releases, and the `quay.io` and Bitnami images are gone. A fresh droplet can't install it the usual way. Building MinIO from source is possible, but then you build and patch it yourselves.
- **R2 is S3-compatible,** so the existing upload code works with configuration changes only. There's no storage server to run, secure or back up.
- **At this size it costs nothing.** Each month includes 10 GB of storage, 1 million writes and 10 million reads free, and R2 never charges for egress (images going out to customers). Beyond the free tier, storage is $0.015 per GB-month. DigitalOcean Spaces would be a flat $5/month for the same job.
- **Images are served from Cloudflare's edge,** which has locations in Nairobi and Mombasa, through the bucket's custom domain.
- **Local development is unchanged.** MinIO keeps running from `docker-compose.yml`, using the copy already on your machine.

### One droplet with Docker Compose
- Right-sized for launch: the measured peak is about half of the $12 droplet's memory. Every service has a health check and restarts automatically.
- To grow, resize the droplet, or move Postgres to DigitalOcean Managed Postgres. Nothing in the app assumes a single machine except the rate limiter, which keeps its counters in the API's memory. A second API instance would need a shared counter store (e.g. Redis) first.

---

## Sizing: starting on the $12 droplet

**Plan:** start on **Basic Regular, 1 vCPU / 2 GB RAM / 50 GB SSD (about $12/month)**, and move up as revenue grows ([when to upgrade](#when-to-upgrade)).

### Measured memory
Measured on the production stack itself (`deploy/docker-compose.prod.yml`), running locally:

| Service | Idle (measured) |
|---|---|
| API (Bun) | 69 MB |
| Postgres (empty) | 34 MB |
| Caddy | 15 MB |
| **Whole stack** | **≈ 120 MB** |

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

### Storage for images (R2, not the droplet)
Measured on the current catalogue: one uploaded photo is stored in three WebP sizes, about **125 KB** in total (thumbnail 4 KB, medium 48 KB, large 72 KB). Full-resolution phone photos will be larger, so budget **150–350 KB per photo**.

| Catalogue | Photos (4 per product) | Space used |
|---|---|---|
| 200 products | 800 | ≈ 0.1–0.3 GB |
| 1,000 products | 4,000 | ≈ 0.6–1.4 GB |
| 10,000 products | 40,000 | ≈ 6–14 GB |

Even 10,000 products sit around R2's 10 GB free allowance; past it, each extra GB is $0.015/month. **The droplet's disk doesn't hold images.**

### Droplet disk (50 GB)
| Item | Space |
|---|---|
| OS | ~5 GB |
| Pulled images | ~0.5 GB per release; prune old ones |
| Postgres | under 1 GB in year one (50,000 orders with their history is still under 1 GB) |
| Logs | capped by the compose file at 10 MB × 5 files per service |
| Local backups | small |

### Transfer
- A product page is about 0.5–0.7 MB of images. **R2 doesn't charge for egress,** and Cloudflare's cache answers most image views without reading from R2, so image traffic costs nothing however busy the shop gets.
- The droplet's own transfer allowance (2 TB on this size) covers the API and static files many times over.

### Starting budget
Prices are approximate; check DigitalOcean's and Cloudflare's pricing pages.

| | Spec | Approx. monthly |
|---|---|---|
| **Droplet** | Basic Regular, 1 vCPU / 2 GB / 50 GB SSD, Ubuntu 24.04 LTS | ~$12 |
| Block Storage volume | 10 GiB at `/mnt/bagstreet` for Postgres data and backups | ~$1 |
| Cloudflare R2 | free tier: 10 GB, 1M writes and 10M reads a month, no egress fees | $0 at launch |
| Droplet backups | weekly | ~$2.40 |
| **Total** | | **≈ $15/month** |

**Why use a separate volume for Postgres?** It survives rebuilding or resizing the droplet, and you can snapshot it on its own. You can grow it later without downtime.

**Region:** DigitalOcean has no African region. Pick FRA1, AMS3 or LON1 for the droplet by testing latency from Kenya (DigitalOcean's speed-test pages are a quick way to do this); it mostly affects API response times. R2 has no African location either, but images are served from Cloudflare's edge, so the bucket's location matters little. Create it with the default **Automatic** location, or the **Western Europe** hint to sit near the droplet.

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

### 1. Images: R2 behind a custom domain (required)
- **Connect a custom domain** to the bucket (bucket → Settings → Custom Domains), such as `media.example.co.ke`. The domain must be added to Cloudflare, in the same account, as a zone: either move its DNS to Cloudflare, or use Cloudflare's partial (CNAME) setup. The custom domain is what puts Cloudflare's cache in front of R2.
- **Don't use the `r2.dev` address in production.** Cloudflare rate-limits it and describes it as for development only. Leave it disabled.
- **Cache settings:** every image is uploaded with `Cache-Control: public, max-age=31536000, immutable`, so Cloudflare's edge and browsers keep it for a year. Cloudflare caches `.webp` files by default; no cache rule is needed.
- **No cache purging is ever needed.** File names are random UUIDs, and a new or replaced photo always gets a new URL.
- **Choose the final image URL before launch.** The full image URL (`STORAGE_PUBLIC_URL` + file name) is stored in the database for each product, so changing the image domain later means a SQL update to rewrite stored URLs. With your own subdomain you can change storage provider later without touching stored URLs.
- **Deleted images:** when an image is replaced or a product removed, the app deletes it from R2, but Cloudflare's cache can keep serving it until it expires. That's fine for normal use. For an urgent takedown (for example a copyright complaint), purge that URL in the Cloudflare dashboard (Caching → Configuration → Custom Purge).

### 2. Optional: Cloudflare in front of Caddy (storefront and API)
**Why:** Cloudflare has edge locations in Nairobi and Mombasa. It would cache the storefront's JavaScript, CSS and static images close to customers, and add DDoS protection. The free plan is enough.

How to set it up:
1. If the domain isn't on Cloudflare yet, move its DNS there (you may already have, for the image domain). Turn the orange-cloud proxy on for `example.co.ke`, `admin.` and `api.`.
2. Set SSL/TLS mode to **Full (strict)**. Caddy keeps its Let's Encrypt certificates.
3. **Caching:** the hashed files under `/assets/*` are already marked immutable, and `index.html` is `no-cache`, so Cloudflare's defaults behave correctly. **Don't add "cache everything" rules for `api.`**: the API is dynamic and per-user.
4. **The IP chain changes.** You must update Caddy and `TRUST_PROXY_HOPS`, as described [below](#with-cloudflare-in-front).


---

## Securing images

| Layer | What protects it |
|---|---|
| **No listing** | Images are public only through the custom domain, which doesn't let anyone list the bucket. Keep the `r2.dev` address disabled. R2 has no per-file permissions: the bucket's public access is the switch. Names are random UUIDs, so they can't be guessed. |
| **Scoped key** | Create an **R2 API token with Object Read & Write, scoped to `bagstreet-media` only**. Even if the API server leaked it, no other bucket and nothing else on the Cloudflare account would be exposed. |
| **Uploads only through the API** | Only signed-in admins can upload, via the API. The bucket accepts no anonymous writes. |
| **Re-encoding strips payloads** | Every upload is decoded and re-encoded to WebP by `sharp`. This throws away EXIF/GPS metadata and anything hidden in the original file, and SVG and other non-image types are rejected. |
| **Correct content type** | Images are stored as `image/webp` with long-lived cache headers. |
| **The API's own limits** | API requests are capped at 10 MB, and Caddy caps uploads at 16 MB. |

> **Known mismatch:** the upload code accepts images up to 15 MB, but the API's request limit is 10 MB, so photos between 10 and 15 MB fail. That's rare with phone photos (usually 2–5 MB). Raise the limit in `server/src/index.ts` if it causes problems.

**Check after setup.** Neither of these may list files: expect an error status (such as 400, 401, 403 or 404) and no XML list of objects.

```bash
curl -s -w '\n%{http_code}\n' https://media.example.co.ke/
curl -s -w '\n%{http_code}\n' "https://<account-id>.r2.cloudflarestorage.com/bagstreet-media?list-type=2"
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

### 1. Create the DigitalOcean and Cloudflare resources
1. **Droplet:** Ubuntu 24.04 LTS, 1 vCPU / 2 GB ([sizing](#sizing-starting-on-the-12-droplet)), **SSH key login only**, monitoring enabled, weekly backups enabled.
2. **Block Storage volume:** 10 GiB in the same region, attached to the droplet and mounted at `/mnt/bagstreet`. Add it to `/etc/fstab` as the DigitalOcean panel shows.
3. **Domain on Cloudflare:** add the shop's domain to your Cloudflare account (free plan), so R2 can use it.
4. **R2 bucket:** `bagstreet-media`, location Automatic (or the Western Europe hint). Under Settings → Custom Domains add `media.example.co.ke`. Leave the `r2.dev` address disabled.
5. **R2 API token:** Object Read & Write, scoped to `bagstreet-media` only. Copy the Access Key ID and Secret Access Key straight into `.env.production`: the secret is shown only once. The account ID (for `STORAGE_ENDPOINT`) is on the R2 overview page.
6. **A second, private bucket for backups:** `bagstreet-backups`, with no public access and its own Object Read & Write token.
7. **DNS:** `A` records for `example.co.ke`, `www`, `admin` and `api`, all pointing to the droplet IP. Leave them DNS-only (grey cloud) unless you set up the [optional Cloudflare proxy](#2-optional-cloudflare-in-front-of-caddy-storefront-and-api).

### 2. Harden the server
```bash
adduser deploy && usermod -aG sudo deploy        # then log in as deploy
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
sudo apt update && sudo apt install -y unattended-upgrades fail2ban
```
In `/etc/ssh/sshd_config`, set `PermitRootLogin no` and `PasswordAuthentication no`, then restart `ssh`.

#### Move SSH off port 22, and make port 22 a trap
Bots hammer port 22 all day. Moving SSH to another port mostly cuts that noise; the real protection is still key-only login (above). Port 22 then becomes a trap: anything that tries it is a scanner, so fail2ban bans its IP **from SSH only, for a week**.

Two rules keep this safe:
- **Never ban from the shop.** Many Kenyan mobile customers share one IP address, so a ban on ports 80/443 could cut off real customers along with one infected phone. The bans below cover the SSH port only.
- **Don't lock yourself out.** Keep your current SSH session open until the new port works from a second terminal. If you do get locked out, the droplet's **Recovery Console** in the DigitalOcean panel still works.

The examples use port **49222**. Pick your own: any unused port between 1024 and 65535.

**1. Open the new port first**, before SSH moves to it:
```bash
sudo ufw allow 49222/tcp
```
If you use a DigitalOcean Cloud Firewall, allow 49222 there too.

**2. Move SSH.** On Ubuntu 24.04, SSH is started by `ssh.socket`, which reads the port from `sshd_config` when systemd reloads; restarting `ssh` alone isn't enough.
```bash
echo 'Port 49222' | sudo tee /etc/ssh/sshd_config.d/10-port.conf
sudo systemctl daemon-reload && sudo systemctl restart ssh.socket
sudo ss -tlnp | grep -E ':(22|49222)\b'     # should list 49222 only
```
If it still lists 22, point the socket at the new port directly, then reload and restart again:
```bash
sudo mkdir -p /etc/systemd/system/ssh.socket.d
printf '[Socket]\nListenStream=\nListenStream=49222\n' | sudo tee /etc/systemd/system/ssh.socket.d/port.conf
sudo systemctl daemon-reload && sudo systemctl restart ssh.socket
```

**3. Test from a second terminal**, keeping the first one open:
```bash
ssh -p 49222 deploy@<droplet-ip>
```
On your laptop, add it to `~/.ssh/config` so plain `ssh bagstreet` works:
```
Host bagstreet
  HostName <droplet-ip>
  User deploy
  Port 49222
```

**4. Close port 22 in the firewall, and log what hits it.** The firewall itself records every attempt on port 22 in `/var/log/ufw.log`; no extra listener is needed.
```bash
sudo ufw delete allow OpenSSH
sudo ufw logging low
```

**5. Point fail2ban at the new port, and add the trap.** The existing `sshd` jail (failed logins) must ban on the new port, and the new `ssh-trap` jail bans anyone who knocks on 22. Both bans apply to port 49222 only.
```bash
sudo tee /etc/fail2ban/filter.d/ssh-trap.conf > /dev/null <<'EOF'
[Definition]
# A blocked connection attempt to port 22, as logged by ufw.
failregex = \[UFW BLOCK\] .* SRC=<HOST> .* PROTO=TCP .* DPT=22\b
ignoreregex =
EOF

sudo tee /etc/fail2ban/jail.d/bagstreet.local > /dev/null <<'EOF'
[DEFAULT]
# Never ban yourself: add your home/office IP after the spaces if it's fixed.
ignoreip = 127.0.0.1/8 ::1

[sshd]
port = 49222

[ssh-trap]
enabled   = true
filter    = ssh-trap
backend   = auto
logpath   = /var/log/ufw.log
port      = 49222
maxretry  = 1
findtime  = 1d
bantime   = 1w
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status ssh-trap
```

**Check it works.** From a phone hotspot (not the IP you SSH from), run `nc -vz -w 3 <droplet-ip> 22`. Within a minute, `sudo fail2ban-client status ssh-trap` lists that IP under "Banned IP list", the shop still loads from it, and `ssh -p 49222` from it is refused.

**Useful commands:**
```bash
sudo fail2ban-client status ssh-trap                   # who is banned
sudo fail2ban-client set ssh-trap unbanip <ip>         # unban an address
sudo grep -E 'DPT=22\b' /var/log/ufw.log | tail       # recent knocks on port 22
```

**Stronger, optional:** if your own IP is fixed, a DigitalOcean Cloud Firewall rule that allows port 49222 **only from your IP** means nobody else can reach SSH at all. The trap then just records who is scanning. Most home and mobile connections in Kenya change IP, though, so this can lock you out; keep the Recovery Console in mind.

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
$C up -d postgres
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

### 7. Paystack (production)
1. In the Paystack dashboard (Settings → API Keys & Webhooks), set the webhook URL to `https://api.example.co.ke/api/payments/paystack/webhook`.
2. Put the live secret key in `PAYSTACK_SECRET_KEY`, and the webhook signing secret in `PAYSTACK_WEBHOOK_SECRET` if the dashboard shows one.
3. Run `$C up -d api` to restart with the new settings.
4. Place one small real order end to end.
5. In Admin → **Reconciliation**, import that day's Paystack transactions export. It confirms the CSV columns are detected correctly and records the fee.

### 8. Verify before launch
- [ ] `curl https://api.example.co.ke/health/ready` reports `READY`, with the database `UP`.
- [ ] The storefront and admin load over HTTPS. `http://` and `www.` redirect.
- [ ] **The IP check.** The 11th request must return `429`. If every request gets `400`, the limiter is being fooled; check `TRUST_PROXY_HOPS` and make sure the API publishes no ports.
  ```bash
  for i in $(seq 1 11); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'content-type: application/json' -H "X-Forwarded-For: 198.51.100.$i" -d '{}' https://api.example.co.ke/api/orders; done; echo
  ```
  This blocks **your own IP** from placing orders for an hour. To reset it:
  ```bash
  $C restart api   # rate-limit counters live in the API's memory
  ```
- [ ] Upload a product photo in the admin. Its URL starts with `STORAGE_PUBLIC_URL` and loads in a private browser window.
- [ ] Neither listing check [above](#securing-images) returns a list of files.
- [ ] Nothing except your SSH port (e.g. 49222), 80 and 443 is open. From your laptop, `nmap -Pn -p 22,80,443,49222 <droplet-ip>` should show 22 as filtered and the other three open. (A plain `nmap` scans only common ports, so name your SSH port.)
- [ ] The port-22 trap bans a test IP from SSH only ([check](#move-ssh-off-port-22-and-make-port-22-a-trap)).

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

The database is the irreplaceable part. Images are in R2, which stores data redundantly.

Nightly Postgres dump, kept 14 days locally and copied to the private backups bucket:
```bash
# /etc/cron.d/bagstreet-backup  (runs as deploy; install s3cmd and configure it with the backups token,
#  host <account-id>.r2.cloudflarestorage.com, region auto)
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
| `STORAGE_ENDPOINT`, `STORAGE_PORT`, `STORAGE_USE_SSL` | `<account-id>.r2.cloudflarestorage.com`, `443`, `true` | R2's S3 API |
| `STORAGE_REGION` | `auto` | R2's signing region (`us-east-1` is accepted as an alias). |
| `STORAGE_PUBLIC_URL` | `https://media.example.co.ke` | The bucket's custom domain. Stored in image URLs; [choose it before launch](#1-images-r2-behind-a-custom-domain-required). |
| `UNPAID_ORDER_TTL_MINUTES` | `45` | Releases stock held by abandoned checkouts. |
| `RUN_MIGRATIONS_ON_STARTUP` | `false` (set by compose) | Migrations run as an explicit step. |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` | Live key; the test key stays in local `.env`. |

**Storage settings are named `STORAGE_*`**, because production uses R2 rather than MinIO. The old `MINIO_*` names are still read as a fallback, with a startup warning, so existing local `.env` files keep working. The `MINIO_ROOT_*` settings in the local `docker-compose.yml` configure the MinIO container itself and are unrelated.

The compose file sets `DATABASE_URL`, `SERVER_URL`, `STOREFRONT_URL`, `CLIENT_URL` and `CORS_ORIGIN` from the domains and credentials in `.env.production`, so they can't drift out of sync.
