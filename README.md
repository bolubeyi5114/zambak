# Zambak Danışmanlık – Randevu ve Danışan Takip

Statik web uygulaması (HTML/CSS/JS), veritabanı Supabase (Frankfurt).

Dosyalar `public/` klasöründe.

- `index.html` + `app.js`: herkese açık randevu sayfası (girişsiz)
- `yonetim.html` + `yonetim.js`: yönetim paneli (randevular, danışan dosyaları, görüşmeler, ödevler, çalışma saatleri)
- `config.js`: Supabase adresi ve herkese açık anahtar
- `_headers`: güvenlik başlıkları (Cloudflare)

Yayın: Cloudflare Workers (statik dosyalar). `main` dalına yapılan her gönderim otomatik yayına alınır.
