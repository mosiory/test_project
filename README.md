# معاونت فرهنگی و دانشجویی — سامانه مدیریت خوابگاه دانشگاه

سامانه متمرکز مدیریت خوابگاه‌های دانشگاه با پشتیبانی از دو خوابگاه مستقل (**پردیس فناوری - فنی پسران نیشابور** و **پردیس مهارت - کشاورزی**)، کنترل ظرفیت اتاق‌ها به‌صورت تراکنشی، ثبت و جابه‌جایی دانشجویان، انتقال بین خوابگاه‌ها با تأیید سرپرست مقصد، تاریخچه اقامت، تاریخچه فعالیت‌ها (Audit Log با زنجیرهٔ هش)، گزارش‌گیری و خروجی PDF فارسی و پشتیبان‌گیری از پایگاه داده SQLite.

## پشته فنی

- **TypeScript** روی **Node.js 22+**
- **Express 4** + **SQLite** (better-sqlite3، حالت WAL)
- نشست امضاشده با HMAC-SHA256 + رکورد نشست قابل ابطال در دیتابیس
- رمز عبور با **bcrypt**، محدودیت تلاش ورود، هدرهای امنیتی و بررسی Origin
- فرانت‌اند **React 19 + Vite 8 + Tailwind 4**

## حساب‌های کاربری اولیه

در اولین اجرا (دیتابیس خالی) سه حساب ساخته می‌شود. رمزها با `INITIAL_*_PASSWORD` یا مقادیر پیش‌فرض زیر تعیین می‌شوند و **باید بلافاصله پس از اولین ورود تغییر کنند**:

| نقش | نام کاربری | رمز پیش‌فرض | دسترسی |
|---|---|---|---|
| مسئول کل سامانه | `admin` | `Admin@1404` | هر دو خوابگاه، کاربران، انتقال، پشتیبان‌گیری، تنظیمات |
| سرپرست پردیس فناوری | `sup_fanavari` | `Fanavari@1404` | فقط خوابگاه پردیس فناوری |
| سرپرست پردیس مهارت | `sup_maharat` | `Maharat@1404` | فقط خوابگاه پردیس مهارت |

> سرویس در شروع اجرا، فعال بودن رمزهای پیش‌فرض را در لاگ هشدار می‌دهد. رمز حداقل ۸ کاراکتر و شامل حرف و رقم است.

## اجرا

```bash
# ۱) نصب وابستگی‌ها (به‌دلیل تداخل peer dependencies)
npm ci --legacy-peer-deps

# ۲) حالت توسعه (Vite + بازسازی زنده)
npm run dev

# ۳) تست‌ها (Service + HTTP/امنیت)
npm test

# ۴) بررسی TypeScript
npm run lint

# ۵) ساخت نسخه تولید و اجرای آن
npm run build
npm start          # NODE_ENV=production را خودش تنظیم می‌کند و بدون dist اجرا نمی‌شود
```

مرورگر: **http://localhost:4780** — تغییر پورت: `PORT=4781 npm run dev`.

> ⚠️ `npm run dev` فقط برای توسعه است و فایل‌های پروژه را سرو می‌کند. روی سرور **فقط** `npm start` (پس از `npm run build`) استفاده شود.

## پیکربندی محیطی

فایل `.env` به‌صورت خودکار خوانده می‌شود (نمونه: `.env.example`). مهم‌ترین کلیدها:

| کلید | پیش‌فرض | توضیح |
|---|---|---|
| `NODE_ENV` | `production` در `npm start` | فقط `development` حالت توسعه را فعال می‌کند |
| `HOST` / `PORT` | `127.0.0.1` / `4780` | پیش‌فرض فقط لوکال (پشت Nginx) |
| `TRUST_PROXY` | `0` | پشت Nginx مقدار `1` |
| `FORCE_HTTPS` | `0` | ریدایرکت اجباری به HTTPS |
| `SESSION_SECRET` | تولید خودکار در فایل | حداقل ۶۴ کاراکتر تصادفی |
| `SESSION_TTL_HOURS` / `SESSION_IDLE_HOURS` | `168` / `12` | عمر مطلق و بی‌کاری نشست |
| `LOGIN_MAX_ATTEMPTS_PER_IP` / `..._PER_USER` | `20` / `8` | آستانهٔ قفل موقت ورود |
| `BACKUP_INTERVAL_HOURS` / `BACKUP_RETENTION_DAYS` | `24` / `30` | پشتیبان‌گیری خودکار و نگهداشت |
| `APP_TZ_OFFSET_MINUTES` | `210` | اختلاف تهران با UTC برای فیلتر تاریخ |

## امنیت (پیاده‌سازی‌شده)

- هدرهای `CSP`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`
- کوکی `HttpOnly` + `SameSite=Lax` (+`Secure` روی HTTPS)
- ابطال نشست در خروج، تغییر رمز و غیرفعال‌سازی کاربر؛ idle timeout
- محدودیت تلاش ورود بر اساس IP و نام کاربری + محدودیت عملیات هم‌زمان bcrypt
- ثبت ورودهای ناموفق با IP و User-Agent و **زنجیرهٔ هش** برای تشخیص دستکاری Audit
- اعتبارسنجی سخت‌گیرانهٔ نوع داده در همهٔ مسیرها (بدون ۵۰۰ روی ورودی بد)
- جلوگیری از CSRF با بررسی `Origin` و رد درخواست‌های تغییردهندهٔ بیگانه
- حذف کلید نشست از دیتابیس/بکاپ و انتقال آن به فایل `data/.session-secret` یا محیط
- حذف اتاق فقط توسط مسئول کل، بدون حذف دانشجو؛ در صورت وجود سابقه، «بایگانی» می‌شود
- دسترسی سرپرست صرفاً بر اساس اقامت فعلی/آخرین اقامت (نه سابقهٔ تاریخی)
- مسیرهای ناشناختهٔ API پاسخ JSON 404 می‌دهند؛ خطاهای بدنه ۴۰۰/۴۱۳ هستند

## دیتابیس، پشتیبان و بازیابی

- مسیر: `data/dormitory.db` (+ `-wal` / `-shm`)، حالت WAL.
- **هرگز فقط `dormitory.db` را کپی نکنید**؛ ممکن است داده در `-wal` باشد. از `sqlite3 ... ".backup"` یا دکمهٔ پشتیبان‌گیری استفاده کنید.
- پشتیبان‌گیری خودکار هر `BACKUP_INTERVAL_HOURS` در `data/backups/` انجام و قدیمی‌تر از `BACKUP_RETENTION_DAYS` حذف می‌شود.
- بررسی سلامت: `PRAGMA integrity_check` از دکمهٔ «بررسی سلامت» یا `GET /api/backups/:id/verify`.
- بازیابی: سرویس را متوقف کنید، `dormitory.db` و فایل‌های `-wal/-shm` را کنار بگذارید، بکاپ را جایگزین کنید، `chown` و `integrity_check` و سپس شروع سرویس.

## استقرار روی سرور خام

فایل‌های آماده در پوشهٔ `deploy/`:

- `deploy/khabgah.service` — Unit سرویس systemd با سخت‌سازی
- `deploy/nginx.conf.example` — TLS + هدرها + Rate Limit
- `deploy/backup.sh` — بکاپ امن + نگهداشت

خلاصهٔ گام‌ها:

```bash
# پیش‌نیازها (Ubuntu 24.04)
apt install -y nginx sqlite3 certbot python3-certbot-nginx build-essential python3
# Node.js 22 از NodeSource نصب شود.

# نصب و ساخت
cd /opt/khabgah
npm ci --legacy-peer-deps
npm run build
npm test

# متغیرها
install -d -m 750 /etc/khabgah
# /etc/khabgah/khabgah.env را از .env.example بسازید (NODE_ENV=production, SESSION_SECRET=...)

# سرویس
cp deploy/khabgah.service /etc/systemd/system/khabgah.service
systemctl daemon-reload && systemctl enable --now khabgah

# Nginx
cp deploy/nginx.conf.example /etc/nginx/sites-available/khabgah
ln -s /etc/nginx/sites-available/khabgah /etc/nginx/sites-enabled/khabgah
nginx -t && systemctl reload nginx
certbot --nginx -d dorm.example.ac.ir
ufw allow 80,443/tcp && ufw deny 4780

# بکاپ روزانه
install -m 750 deploy/backup.sh /usr/local/bin/khabgah-backup.sh
echo '15 2 * * * root /usr/local/bin/khabgah-backup.sh' > /etc/cron.d/khabgah-backup
```

> برنامه را **تک‌نمونه** اجرا کنید (SQLite و کنترل ظرفیت درون‌پروسه‌ای). برای چند سرور به PostgreSQL مهاجرت کنید.

## سلامت و نگهداری

- `GET /api/health` — بررسی سلامت عمومی (بدون داده حساس)
- `GET /api/audit-logs/integrity` — بررسی زنجیرهٔ هش لاگ‌ها (فقط مسئول کل)
- صفحه‌بندی اختیاری: `?page=1&pageSize=50` در `students`، `audit-logs` و `movements`
- لاگ درخواست‌ها روی خروجی استاندارد/`journalctl` بدون ثبت Query (برای جلوگیری از نشت داده)

## تست

```bash
npm test    # ۳۶ تست: قواعد دامنه، سرویس و HTTP/امنیت
npm run lint
```
