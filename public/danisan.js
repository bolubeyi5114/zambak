(function () {
  const C = window.ZAMBAK;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { storageKey: "zambak-danisan" } });
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtTam = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const fmtGunKisa = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "short" });
  const fmtTarih = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "long", year: "numeric" });
  const fmtMesaj = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const ODEV_DURUM = { verildi: "Bekliyor", yapildi: "Yaptım", kismen: "Kısmen yaptım", yapilmadi: "Yapamadım" };
  const KIME = { danisan: "Danışan için", veli: "Veli için", aile: "Aile için" };
  const BASLIK = { ozet: "Özet", odevler: "Ödevler", mesajlar: "Mesajlar" };
  let aktif = "ozet";
  let bilgi = null;

  function bildir(m) {
    const el = document.createElement("div");
    el.className = "bildirim";
    el.textContent = m;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- Giriş ----------
  const telEposta = (t) => {
    const d = String(t).replace(/\D/g, "").slice(-10);
    return /^5\d{9}$/.test(d) ? `90${d}@danisan.zambak.app` : null;
  };
  function girisGoster(hata) {
    $("#panel").classList.add("gizli");
    $("#giris-ekrani").classList.remove("gizli");
    const h = $("#giris-hata");
    h.textContent = hata || "";
    h.classList.toggle("gizli", !hata);
  }
  $("#giris-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const eposta = telEposta($("#g-tel").value);
    if (!eposta) return girisGoster("Telefon numaranızı 05xx xxx xx xx şeklinde yazın.");
    const btn = $("#giris-form button");
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: eposta, password: $("#g-sifre").value });
    btn.disabled = false;
    if (error) return girisGoster("Telefon numarası ya da şifre hatalı.");
    ekraniAc();
  });
  $("#cikis").addEventListener("click", async () => { await sb.auth.signOut(); girisGoster(); });
  $("#sifre-kaydet").addEventListener("click", async () => {
    const s = $("#yeni-sifre").value;
    if (s.length < 6) return bildir("Şifre en az 6 karakter olmalı.");
    const { error } = await sb.auth.updateUser({ password: s });
    $("#yeni-sifre").value = "";
    bildir(error ? "Şifre değiştirilemedi." : "Şifreniz değiştirildi.");
  });

  async function ekraniAc() {
    const { data, error } = await sb.rpc("portal_bilgi");
    if (error || !data) {
      await sb.auth.signOut();
      return girisGoster("Bu hesapla danışan ekranına girilemiyor. Uzmanınızla iletişime geçin.");
    }
    bilgi = data;
    $("#giris-ekrani").classList.add("gizli");
    $("#panel").classList.remove("gizli");
    if (!hashIsle()) menuAc("ozet");
  }

  // ---------- Menü ----------
  $$(".alt-menu [data-menu]").forEach((b) => b.addEventListener("click", () => menuAc(b.dataset.menu)));
  $$("[data-git]").forEach((b) => b.addEventListener("click", () => menuAc(b.dataset.git)));
  function menuAc(ad) {
    aktif = ad;
    $$(".alt-menu [data-menu]").forEach((b) => b.classList.toggle("aktif", b.dataset.menu === ad));
    $("#bolum-baslik").textContent = BASLIK[ad];
    ["ozet", "odevler", "mesajlar"].forEach((s) => $("#" + s).classList.toggle("gizli", s !== ad));
    window.scrollTo({ top: 0 });
    if (ad === "ozet") ozetYukle();
    else if (ad === "odevler") odevleriYukle();
    else mesajlariYukle(true);
  }
  function rozetler() {
    $("#m-odev").textContent = bilgi.acik_odev;
    $("#m-mesaj").textContent = bilgi.okunmamis;
    $("#menu-odev").classList.toggle("gizli", !bilgi.acik_odev);
    $("#menu-mesaj").classList.toggle("gizli", !bilgi.okunmamis);
  }

  // ---------- Özet ----------
  async function ozetYukle() {
    const { data } = await sb.rpc("portal_bilgi");
    if (data) bilgi = data;
    const saat = Number(new Intl.DateTimeFormat("en-GB", { timeZone: C.TZ, hour: "2-digit", hour12: false }).format(new Date()));
    const selam = saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : "İyi akşamlar";
    $("#selam").textContent = bilgi.tur === "cocuk" || bilgi.tur === "ergen" ? `${selam}! ${bilgi.ad} için takip ekranı.` : `${selam}, ${bilgi.ad}.`;
    rozetler();
    takipYukle();
    dosyalariYukle();
    bildirimKarti();
    const r = bilgi.randevular || [];
    $("#randevu-liste").innerHTML = r.length
      ? r.map((a) => `<div class="satir-kart ${a.durum}" style="cursor:default">
          <span class="sk-orta"><strong>${esc(fmtTam.format(new Date(a.start_at)))}</strong><small>${a.durum === "beklemede" ? "Onay bekliyor" : "Onaylandı"} · Uzm. ${esc(C.UZMAN)}</small></span>
        </div>`).join("")
      : `<p class="bos">Planlanmış randevunuz yok. Yeni randevu için <a href="/">randevu sayfasını</a> kullanabilirsiniz.</p>`;

    const { data: g } = await sb.rpc("portal_gorusmeler");
    const liste = g || [];
    const puanli = liste.filter((s) => s.progress);
    const graf = $("#ilerleme-grafik");
    if (!puanli.length) {
      graf.innerHTML = '<p class="bos">Görüşmeler ilerledikçe gelişim grafiğiniz burada oluşacak.</p>';
      $("#ilerleme-ozet").textContent = "";
    } else {
      graf.innerHTML = puanli.slice(-12).map((s) => `
        <div class="cubuk-kap"><span class="cubuk-deger">${s.progress}</span><div class="cubuk" style="height:${s.progress * 10}%"></div>
        <span class="cubuk-tarih">${esc(fmtGunKisa.format(new Date(s.session_date)))}</span></div>`).join("");
      const ilk = puanli[0].progress, son = puanli[puanli.length - 1].progress;
      $("#ilerleme-ozet").textContent = puanli.length > 1 ? `${ilk} → ${son}` : `${son}/10`;
    }
    const ozetler = liste.filter((s) => s.shared_summary).reverse();
    $("#ozet-listesi").innerHTML = ozetler.length
      ? ozetler.map((s) => `<div class="gorusme"><div class="gorusme-ust"><strong>${esc(fmtTarih.format(new Date(s.session_date)))}</strong></div>
          <div class="gorusme-bolum"><p>${esc(s.shared_summary)}</p></div></div>`).join("")
      : '<p class="bos">Uzmanınız görüşme özetlerini paylaştığında burada görünecek.</p>';
  }

  // ---------- Ödevler ----------
  async function odevleriYukle() {
    const kap = $("#odev-listesi");
    kap.innerHTML = '<div class="yukleniyor">Yükleniyor…</div>';
    const { data, error } = await sb.rpc("portal_odevler");
    if (error) { kap.innerHTML = '<div class="hata">Ödevler yüklenemedi.</div>'; return; }
    const liste = data || [];
    bilgi.acik_odev = liste.filter((t) => t.status === "verildi").length;
    rozetler();
    if (!liste.length) { kap.innerHTML = '<p class="bos">Şu an size verilmiş bir ödev yok.</p>'; return; }
    const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(new Date());
    kap.innerHTML = liste.map((t) => {
      const gecikti = t.status === "verildi" && t.due_date && t.due_date < bugun;
      return `<div class="randevu odev ${t.status}">
        <div class="odev-ust"><strong>${esc(t.title)}</strong><span class="rozet odev-${t.status}">${ODEV_DURUM[t.status]}</span></div>
        <div class="aciklama" style="margin:2px 0">${KIME[t.assigned_to]} · ${esc(fmtGunKisa.format(new Date(t.created_at)))}${t.due_date ? ` · Son gün: <span class="${gecikti ? "gecikti" : ""}">${esc(fmtGunKisa.format(new Date(t.due_date + "T12:00:00Z")))}</span>` : ""}</div>
        ${t.description ? `<p class="odev-aciklama">${esc(t.description)}</p>` : ""}
        <div class="secenekler odev-durumlar">
          ${["yapildi", "kismen", "yapilmadi"].map((k) => `<button type="button" class="cip kucuk-cip${t.status === k ? " secili" : ""}" data-id="${t.id}" data-durum="${k}">${ODEV_DURUM[k]}</button>`).join("")}
        </div>
        <label for="n-${t.id}">Nasıl geçti? <small>(isteğe bağlı)</small></label>
        <div class="satir-buton">
          <input type="text" id="n-${t.id}" maxlength="500" value="${esc(t.feedback)}" placeholder="Kısaca yazın">
          <button type="button" class="btn kucuk ikincil" data-kaydet="${t.id}">Kaydet</button>
        </div>
      </div>`;
    }).join("");
    const guncelle = async (id, durum) => {
      const t = liste.find((x) => x.id === id);
      const { error } = await sb.rpc("portal_odev_guncelle", { p_id: id, p_status: durum || t.status, p_feedback: $("#n-" + id).value });
      bildir(error ? "Kaydedilemedi." : "Kaydedildi.");
      odevleriYukle();
    };
    $$("[data-durum]", kap).forEach((b) => b.addEventListener("click", () => guncelle(b.dataset.id, b.dataset.durum)));
    $$("[data-kaydet]", kap).forEach((b) => b.addEventListener("click", () => guncelle(b.dataset.kaydet)));
  }

  // ---------- Mesajlar ----------
  async function mesajlariYukle(enAltaIn) {
    const { data, error } = await sb.rpc("portal_mesajlar");
    if (error) return;
    const liste = (data || []).slice().reverse();
    const kap = $("#mesaj-listesi");
    const enAltta = kap.scrollHeight - kap.scrollTop - kap.clientHeight < 40;
    kap.innerHTML = liste.length ? liste.map((m) => `
      <div class="balon ${m.sender === "danisan" ? "giden" : "gelen"}">
        <p>${esc(m.body)}</p>
        <small>${m.sender === "uzman" ? "Uzm. " + esc(C.UZMAN.split(" ")[0]) + " · " : ""}${esc(fmtMesaj.format(new Date(m.created_at)))}${m.sender === "danisan" ? (m.read_at ? " · Okundu" : " · İletildi") : ""}</small>
      </div>`).join("") : '<p class="bos">Uzmanınıza buradan mesaj yazabilirsiniz.</p>';
    if (enAltaIn || enAltta) kap.scrollTop = kap.scrollHeight;
    bilgi.okunmamis = 0;
    rozetler();
  }
  $("#mesaj-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const metin = $("#mesaj-metin").value.trim();
    if (!metin) return;
    const btn = $("#mesaj-form button");
    btn.disabled = true;
    const { error } = await sb.rpc("portal_mesaj_gonder", { p_body: metin });
    btn.disabled = false;
    if (error) return bildir(error.message || "Mesaj gönderilemedi.");
    $("#mesaj-metin").value = "";
    mesajlariYukle(true);
  });
  setInterval(async () => {
    if (document.hidden || $("#panel").classList.contains("gizli")) return;
    if (aktif === "mesajlar") mesajlariYukle(false);
    else {
      const { data } = await sb.rpc("portal_bilgi");
      if (data) { bilgi = data; rozetler(); }
    }
  }, 30000);

  // ---------- Günlük takip ----------
  function grafik(kayitlar, min, max, dusukIyi, gunSayisi = 7) {
    const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(new Date());
    const g = [];
    for (let i = gunSayisi - 1; i >= 0; i--) { const d = new Date(bugun + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - i); g.push(d.toISOString().slice(0, 10)); }
    const map = Object.fromEntries(kayitlar.map((k) => [String(k.gun).slice(0, 10), Number(k.deger)]));
    const W = 320, H = 90, bw = W / gunSayisi;
    const GUN = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
    const renk = (v) => { const o = (v - min) / (max - min); const iyi = dusukIyi ? 1 - o : o; return iyi >= 0.6 ? "#4c6b3a" : iyi >= 0.35 ? "#d1a23a" : "#a33a2b"; };
    let svg = `<svg viewBox="0 0 ${W} ${H + 22}" class="takip-svg" role="img" aria-label="Son ${gunSayisi} gün"><line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#ece4c9"/>`;
    g.forEach((gun, i) => {
      const x = i * bw + bw * 0.22, w = bw * 0.56, v = map[gun];
      if (v === undefined) svg += `<circle cx="${x + w / 2}" cy="${H - 3}" r="2.5" fill="#cfc6a6"/>`;
      else { const h = Math.max(4, ((v - min) / (max - min)) * (H - 16)); svg += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" rx="4" fill="${renk(v)}"/><text x="${x + w / 2}" y="${H - h - 4}" font-size="11" text-anchor="middle" fill="#2a2f25">${Math.round(v * 10) / 10}</text>`; }
      svg += `<text x="${x + w / 2}" y="${H + 15}" font-size="10" text-anchor="middle" fill="#6b7064">${GUN[new Date(gun + "T12:00:00Z").getUTCDay()]}</text>`;
    });
    return svg + "</svg>";
  }
  const gunStr = (n) => { const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(new Date()) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  async function takipYukle() {
    const { data } = await sb.rpc("portal_takip");
    const liste = data || [];
    $("#takip-kart").classList.toggle("gizli", !liste.length);
    if (!liste.length) return;
    const secim = {};
    $("#takip-alani").innerHTML = liste.map((m) => {
      const bugunK = m.kayitlar.find((k) => String(k.gun).slice(0, 10) === gunStr(0));
      const tam = Number.isInteger(Number(m.min)) && Number.isInteger(Number(m.max)) && m.max - m.min <= 10;
      const uc = m.dusuk_iyi ? ["iyi", "zor"] : ["az", "çok"];
      return `<div class="takip-giris" data-m="${m.id}">
        <div class="odev-ust"><strong>${esc(m.ad)}</strong>${bugunK ? '<span class="kaydedildi">Bugün girildi ✓</span>' : ""}</div>
        <div class="gun-sec">
          <button type="button" class="cip kucuk-cip secili" data-gun="0">Bugün</button>
          <button type="button" class="cip kucuk-cip" data-gun="1">Dün</button>
        </div>
        ${tam
          ? `<div class="deger-izgara">${Array.from({ length: m.max - m.min + 1 }, (_, i) => m.min + i).map((v) => `<button type="button" class="deger${bugunK && Number(bugunK.deger) === v ? " secili" : ""}" data-v="${v}">${v}</button>`).join("")}</div>
             <div class="aciklama kucuk-not" style="display:flex;justify-content:space-between"><span>${m.min} = ${m.dusuk_iyi ? "çok iyi" : "çok az"}</span><span>${m.max} = ${m.dusuk_iyi ? "çok zor" : "çok iyi"}</span></div>`
          : `<div class="satir-buton" style="margin:8px 0"><input type="number" class="deger-input" min="${m.min}" max="${m.max}" step="any" value="${bugunK ? bugunK.deger : ""}" placeholder="${m.min}–${m.max}"><span style="align-self:center">${esc(m.birim || "")}</span></div>`}
        <div class="satir-buton" style="margin-top:6px">
          <input type="text" class="not-input" maxlength="300" placeholder="Not (isteğe bağlı)" value="${esc(bugunK && bugunK.not)}">
          <button type="button" class="btn kucuk" data-kaydet-takip>Kaydet</button>
        </div>
        ${grafik(m.kayitlar, Number(m.min), Number(m.max), m.dusuk_iyi)}
      </div>`;
    }).join("");
    $$("#takip-alani .takip-giris").forEach((el) => {
      const m = liste.find((x) => x.id === el.dataset.m);
      secim[m.id] = { gun: 0, v: null };
      const k0 = m.kayitlar.find((k) => String(k.gun).slice(0, 10) === gunStr(0));
      if (k0) secim[m.id].v = Number(k0.deger);
      const gunGoster = (n) => {
        const k = m.kayitlar.find((x) => String(x.gun).slice(0, 10) === gunStr(n));
        secim[m.id].v = k ? Number(k.deger) : null;
        $$(".deger", el).forEach((b) => b.classList.toggle("secili", k && Number(b.dataset.v) === Number(k.deger)));
        const di = $(".deger-input", el); if (di) di.value = k ? k.deger : "";
        $(".not-input", el).value = (k && k.not) || "";
      };
      $$("[data-gun]", el).forEach((b) => b.addEventListener("click", () => {
        $$("[data-gun]", el).forEach((x) => x.classList.toggle("secili", x === b));
        secim[m.id].gun = Number(b.dataset.gun); gunGoster(secim[m.id].gun);
      }));
      $$(".deger", el).forEach((b) => b.addEventListener("click", () => {
        $$(".deger", el).forEach((x) => x.classList.toggle("secili", x === b)); secim[m.id].v = Number(b.dataset.v);
      }));
      $("[data-kaydet-takip]", el).addEventListener("click", async () => {
        const di = $(".deger-input", el);
        const v = di ? (di.value === "" ? null : Number(di.value)) : secim[m.id].v;
        if (v === null || isNaN(v)) return bildir("Önce bir değer seçin.");
        const { error } = await sb.rpc("portal_takip_kaydet", { p_metric: m.id, p_gun: gunStr(secim[m.id].gun), p_deger: v, p_not: $(".not-input", el).value });
        if (error) return bildir(error.message || "Kaydedilemedi.");
        bildir("Kaydedildi, teşekkürler.");
        takipYukle();
      });
    });
  }

  // ---------- Dosyalar ----------
  async function dosyalariYukle() {
    const { data } = await sb.rpc("portal_dosyalar");
    const liste = data || [];
    $("#dosya-kart").classList.toggle("gizli", !liste.length);
    $("#dosya-listesi").innerHTML = liste.map((f) => `<div class="dosya"><button type="button" class="dosya-ad" data-yol="${esc(f.path)}">
        <span class="dosya-ikon">${/pdf/.test(f.mime || "") ? "PDF" : /image/.test(f.mime || "") ? "IMG" : "DOC"}</span>
        <span><strong>${esc(f.name)}</strong><small>${esc(fmtTarih.format(new Date(f.created_at)))}</small></span></button></div>`).join("");
    $$("#dosya-listesi [data-yol]").forEach((b) => b.addEventListener("click", async () => {
      const w = window.open("", "_blank");
      const { data: u, error } = await sb.storage.from("danisan-dosyalari").createSignedUrl(b.dataset.yol, 300);
      if (error) { if (w) w.close(); return bildir("Dosya açılamadı."); }
      if (w) w.location = u.signedUrl; else location.href = u.signedUrl;
    }));
  }

  // ---------- Bildirimler ----------
  async function bildirimKarti() {
    const d = await ZambakPush.durum(sb).catch(() => "desteklenmiyor");
    $("#bildirim-durum").textContent = ZambakPush.METIN[d];
    const b = $("#bildirim-dugme");
    b.classList.toggle("gizli", !["acik", "kapali"].includes(d));
    b.textContent = d === "acik" ? "Bildirimleri kapat" : "Bildirimleri aç";
    b.classList.toggle("ikincil", d === "acik");
    b.dataset.durum = d;
    $("#bildirim-bant").classList.toggle("gizli", d !== "kapali");
  }
  $("#bildirim-dugme").addEventListener("click", async () => {
    try {
      if ($("#bildirim-dugme").dataset.durum === "acik") { await ZambakPush.kapat(sb); bildir("Bildirimler kapatıldı."); }
      else { await ZambakPush.ac(sb); bildir("Bildirimler açıldı."); }
    } catch (e) { bildir(e.message); }
    bildirimKarti();
  });
  $("#bant-ac").addEventListener("click", async () => {
    try { await ZambakPush.ac(sb); bildir("Bildirimler açıldı."); } catch (e) { bildir(e.message); }
    bildirimKarti();
  });
  function hashIsle() {
    const h = location.hash.replace("#", "");
    if (["ozet", "odevler", "mesajlar"].includes(h)) { history.replaceState(null, "", location.pathname); menuAc(h); return true; }
    return false;
  }
  window.addEventListener("hashchange", () => { if (!$("#panel").classList.contains("gizli")) hashIsle(); });

  // ---------- Başlangıç ----------
  $("#tel-link").textContent = C.TELEFON;
  $("#tel-link").href = "tel:" + C.TELEFON.replace(/\s/g, "");
  (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) ekraniAc();
    else girisGoster();
  })();
})();
