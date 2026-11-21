(function () {
  const C = window.ZAMBAK;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtTam = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const fmtKisa = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const GUNLER = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  const KIMIN = { cocuk: "Çocuk", ergen: "Ergen", yetiskin: "Yetişkin", cift_aile: "Çift / Aile" };
  const DURUM = { beklemede: "Onay bekliyor", onaylandi: "Onaylandı", iptal: "İptal", tamamlandi: "Tamamlandı" };

  function bildir(m) {
    const el = document.createElement("div");
    el.className = "bildirim";
    el.textContent = m;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  // ---------- Oturum ----------
  async function baslat() {
    const { data } = await sb.auth.getSession();
    if (data.session) await paneliAc();
    else girisGoster();
  }
  function girisGoster() {
    $("#panel").classList.add("gizli");
    $("#giris-ekrani").classList.remove("gizli");
  }
  $("#giris-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const hata = $("#giris-hata");
    hata.classList.add("gizli");
    const { error } = await sb.auth.signInWithPassword({ email: $("#g-eposta").value.trim(), password: $("#g-sifre").value });
    if (error) {
      hata.textContent = "E-posta ya da şifre hatalı.";
      hata.classList.remove("gizli");
      return;
    }
    await paneliAc();
  });
  $("#cikis").addEventListener("click", async () => { await sb.auth.signOut(); girisGoster(); });

  async function paneliAc() {
    const { data: yetki } = await sb.rpc("is_admin");
    if (!yetki) {
      await sb.auth.signOut();
      girisGoster();
      const h = $("#giris-hata");
      h.textContent = "Bu hesabın yönetim yetkisi yok.";
      h.classList.remove("gizli");
      return;
    }
    $("#giris-ekrani").classList.add("gizli");
    $("#panel").classList.remove("gizli");
    $("#randevu-link").value = location.origin + "/";
    if (!hashIsle()) menuAc("bugun");
  }

  // Bildirimden gelen bağlantılar: #bekleyen, #danisan=<id>
  function hashIsle() {
    const h = location.hash;
    if (!h) return false;
    history.replaceState(null, "", location.pathname);
    if (h === "#bekleyen") { randevuMod = "beklemede"; menuAc("randevular"); return true; }
    const m = h.match(/^#danisan=([0-9a-f-]{36})$/);
    if (m) { dosyaAc(m[1], "mesaj"); return true; }
    return false;
  }
  window.addEventListener("hashchange", () => { if (!$("#panel").classList.contains("gizli")) hashIsle(); });

  // ---------- Menü ----------
  const BASLIK = { bugun: "Bugün", randevular: "Randevular", danisanlar: "Danışanlar", ayarlar: "Ayarlar" };
  let randevuMod = "gun";
  const tzGun = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(d);
  let seciliGun = tzGun(new Date());
  $$(".alt-menu [data-menu]").forEach((b) => b.addEventListener("click", () => menuAc(b.dataset.menu)));
  function menuIsaretle(ad) {
    $$(".alt-menu [data-menu]").forEach((b) => b.classList.toggle("aktif", b.dataset.menu === ad));
    $("#bolum-baslik").textContent = BASLIK[ad];
  }
  function bolumGoster(...idler) {
    ["#bugun", "#aylik", "#randevular", "#takvim-ayar", "#hesap-ayar", "#danisan-liste", "#danisan-dosya", "#danisan-form-alan"].forEach((s) =>
      $(s).classList.toggle("gizli", !idler.includes(s))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function menuAc(ad) {
    if (ad === "randevular" && seciliGun === null) seciliGun = tzGun(new Date());
    menuIsaretle(ad);
    if (ad === "bugun") { bolumGoster("#bugun"); bugunYukle(); }
    else if (ad === "randevular") { bolumGoster("#randevular"); randevuEkrani(); }
    else if (ad === "danisanlar") { bolumGoster("#danisan-liste"); danisanlariYukle(); }
    else { bolumGoster("#takvim-ayar", "#hesap-ayar"); takvimAyarYukle(); bildirimKarti(); }
    bekleyenSay();
    mesajSay();
  }

  async function mesajSay() {
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("sender", "danisan").is("read_at", null);
    $("#menu-mesaj").classList.toggle("gizli", !count);
    return count || 0;
  }

  async function bekleyenSay() {
    const { count } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "beklemede");
    $("#bekleyen-say").textContent = count ? `(${count})` : "";
    $("#menu-bekleyen").classList.toggle("gizli", !count);
    return count || 0;
  }

  // Türkiye sabit UTC+03:00
  const gunBas = (g) => `${g}T00:00:00+03:00`;
  const gunEkle = (g, n) => { const d = new Date(g + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtSaatK = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, hour: "2-digit", minute: "2-digit" });
  const fmtGunUzun = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

  // ---------- Bugün ----------
  async function bugunYukle() {
    const bugun = tzGun(new Date());
    const saat = Number(new Intl.DateTimeFormat("en-GB", { timeZone: C.TZ, hour: "2-digit", hour12: false }).format(new Date()));
    const selam = saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : "İyi akşamlar";
    $("#selam").textContent = `${selam}, ${C.UZMAN.split(" ")[0]} Hanım · ${fmtGunUzun.format(new Date(bugun + "T12:00:00Z"))}`;
    const sec = "*, topics(name), clients(full_name)";
    const [{ data: bugunR }, { data: yarinR }, bekleyen, { data: geciken }] = await Promise.all([
      sb.from("appointments").select(sec).gte("start_at", gunBas(bugun)).lt("start_at", gunBas(gunEkle(bugun, 1))).neq("status", "iptal").order("start_at"),
      sb.from("appointments").select(sec).gte("start_at", gunBas(gunEkle(bugun, 1))).lt("start_at", gunBas(gunEkle(bugun, 2))).neq("status", "iptal").order("start_at"),
      bekleyenSay(),
      sb.from("tasks").select("id,title,assigned_to,due_date,client_id,clients(full_name)").eq("status", "verildi").lt("due_date", bugun).order("due_date"),
    ]);
    $("#m-bugun-say").textContent = (bugunR || []).length;
    ZambakPush.durum(sb).then((d) => $("#bildirim-bant").classList.toggle("gizli", d !== "kapali")).catch(() => {});
    $("#m-bekleyen-say").textContent = bekleyen;
    gunListesi($("#bugun-liste"), bugunR || [], "Bugün için randevu yok.");
    gunListesi($("#yarin-liste"), yarinR || [], "Yarın için randevu yok.");
    const g = geciken || [];
    $("#geciken-kap").classList.toggle("gizli", !g.length);
    $("#geciken-liste").innerHTML = g.map((t) => `<button type="button" class="satir-kart geciken" data-danisan="${t.client_id}">
        <span class="sk-sol">${esc(fmtGunKisa.format(new Date(t.due_date + "T12:00:00Z")))}</span>
        <span class="sk-orta"><strong>${esc(t.clients ? t.clients.full_name : "")}</strong><small>${esc(t.title)} · ${KIME[t.assigned_to]}</small></span>
      </button>`).join("");
    $$("#geciken-liste [data-danisan]").forEach((b) => b.addEventListener("click", () => dosyaAc(b.dataset.danisan)));
    const { data: yeniM } = await sb.from("messages").select("client_id,body,created_at,clients(full_name)").eq("sender", "danisan").is("read_at", null).order("created_at", { ascending: false }).limit(50);
    const kisi = {};
    (yeniM || []).forEach((m) => { if (!kisi[m.client_id]) kisi[m.client_id] = { ...m, adet: 0 }; kisi[m.client_id].adet++; });
    const mk = Object.values(kisi);
    $("#yeni-mesaj-kap").classList.toggle("gizli", !mk.length);
    $("#yeni-mesaj-liste").innerHTML = mk.map((m) => `<button type="button" class="satir-kart mesaj-satir" data-danisan="${m.client_id}">
        <span class="sk-sol">${esc(fmtSaatK.format(new Date(m.created_at)))}</span>
        <span class="sk-orta"><strong>${esc(m.clients ? m.clients.full_name : "")}</strong><small>${esc(m.body)}</small></span>
        <span class="rozet beklemede">${m.adet}</span>
      </button>`).join("");
    $$("#yeni-mesaj-liste [data-danisan]").forEach((b) => b.addEventListener("click", () => dosyaAc(b.dataset.danisan, "mesaj")));
  }
  function gunListesi(kap, liste, bos) {
    if (!liste.length) { kap.innerHTML = `<p class="bos">${bos}</p>`; return; }
    kap.innerHTML = liste.map((r) => `<button type="button" class="satir-kart ${r.status}" data-r="${r.id}">
        <span class="sk-sol">${esc(fmtSaatK.format(new Date(r.start_at)))}</span>
        <span class="sk-orta"><strong>${esc(r.clients ? r.clients.full_name : r.client_name)}</strong><small>${esc(r.topics ? r.topics.name : "")}</small></span>
        <span class="rozet ${r.status}">${DURUM[r.status]}</span>
      </button>`).join("");
    $$("[data-r]", kap).forEach((b) => b.addEventListener("click", () => {
      const r = liste.find((x) => x.id === b.dataset.r);
      if (r.client_id) dosyaAc(r.client_id);
      else { randevuMod = "gun"; seciliGun = tzGun(new Date(r.start_at)); menuAc("randevular"); }
    }));
  }
  $("#m-bugun").addEventListener("click", () => { randevuMod = "gun"; seciliGun = tzGun(new Date()); menuAc("randevular"); });
  $("#m-bekleyen").addEventListener("click", () => { randevuMod = "beklemede"; menuAc("randevular"); });

  // ---------- Randevular (haftalık takvim) ----------
  $$("#randevu-filtre .cip").forEach((b) => b.addEventListener("click", () => { randevuMod = b.dataset.mod; randevuEkrani(); }));
  $("#hafta-geri").addEventListener("click", () => { seciliGun = gunEkle(seciliGun, -7); randevuEkrani(); });
  $("#hafta-ileri").addEventListener("click", () => { seciliGun = gunEkle(seciliGun, 7); randevuEkrani(); });
  const GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  async function randevuEkrani() {
    $$("#randevu-filtre .cip").forEach((b) => b.classList.toggle("secili", b.dataset.mod === randevuMod));
    $("#hafta-kap").classList.toggle("gizli", randevuMod !== "gun");
    if (randevuMod === "gun") haftaCiz();
    randevulariYukle();
  }
  async function haftaCiz() {
    const d = new Date(seciliGun + "T12:00:00Z");
    const pzt = gunEkle(seciliGun, -((d.getUTCDay() + 6) % 7));
    const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(pzt, i));
    const f = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "short" });
    $("#hafta-baslik").textContent = `${f.format(new Date(pzt + "T12:00:00Z"))} – ${f.format(new Date(gunler[6] + "T12:00:00Z"))}`;
    $("#gun-baslik").textContent = fmtGunUzun.format(new Date(seciliGun + "T12:00:00Z"));
    const bugun = tzGun(new Date());
    const ciz = (say) => {
      $("#hafta").innerHTML = gunler.map((g, i) => `<button type="button" class="hgun${g === seciliGun ? " secili" : ""}${g === bugun ? " bugun" : ""}" data-g="${g}">
          <span>${GUN_KISA[i]}</span><strong>${Number(g.slice(8))}</strong><em>${say[g] || ""}</em>
        </button>`).join("");
      $$("#hafta [data-g]").forEach((b) => b.addEventListener("click", () => { seciliGun = b.dataset.g; haftaCiz(); randevulariYukle(); }));
    };
    ciz({});
    const { data } = await sb.from("appointments").select("start_at").gte("start_at", gunBas(pzt)).lt("start_at", gunBas(gunEkle(pzt, 7))).neq("status", "iptal");
    const say = {};
    (data || []).forEach((r) => { const g = tzGun(new Date(r.start_at)); say[g] = (say[g] || 0) + 1; });
    ciz(say);
  }

  async function randevulariYukle() {
    const kap = $("#liste");
    kap.innerHTML = '<div class="yukleniyor">Yükleniyor…</div>';
    const simdi = new Date().toISOString();
    let q = sb.from("appointments").select("*, topics(name)");
    if (randevuMod === "gun") q = q.gte("start_at", gunBas(seciliGun)).lt("start_at", gunBas(gunEkle(seciliGun, 1))).order("start_at");
    else if (randevuMod === "beklemede") q = q.eq("status", "beklemede").order("start_at");
    else q = q.or(`start_at.lt.${simdi},status.in.(iptal,tamamlandi)`).order("start_at", { ascending: false }).limit(100);
    const { data, error } = await q;
    if (error) { kap.innerHTML = '<div class="hata">Randevular yüklenemedi.</div>'; return; }
    if (!data.length) {
      kap.innerHTML = `<p class="bos">${randevuMod === "gecmis" ? "Geçmiş randevu yok." : randevuMod === "beklemede" ? "Onay bekleyen randevu yok." : "Bu gün için randevu yok."}</p>`;
      return;
    }
    kap.innerHTML = data.map(kartHtml).join("");
    $$("[data-islem]", kap).forEach((b) => b.addEventListener("click", () => durumDegistir(b.dataset.id, b.dataset.islem)));
    $$("[data-not-kaydet]", kap).forEach((b) => b.addEventListener("click", () => notKaydet(b.dataset.notKaydet)));
    $$("[data-dosya]", kap).forEach((b) => b.addEventListener("click", () => {
      const r = data.find((x) => x.id === b.dataset.dosya);
      if (r.client_id) dosyaAc(r.client_id);
      else randevudanDanisan(r);
    }));
  }

  function waLink(tel) {
    let d = String(tel).replace(/\D/g, "");
    if (d.startsWith("0")) d = "9" + d;
    else if (d.length === 10 && d.startsWith("5")) d = "90" + d;
    return "https://wa.me/" + d;
  }

  function kartHtml(r) {
    const satir = (a, b) => (b === null || b === undefined || b === "" ? "" : `<dt>${a}</dt><dd>${esc(b)}</dd>`);
    const destek = r.prior_support === null ? "" : r.prior_support ? "Evet" + (r.prior_support_note ? " – " + r.prior_support_note : "") : "Hayır";
    const islemler = [];
    if (r.status === "beklemede") islemler.push(`<button class="btn kucuk" data-islem="onaylandi" data-id="${r.id}">Onayla</button>`);
    if (r.status === "onaylandi") islemler.push(`<button class="btn kucuk" data-islem="tamamlandi" data-id="${r.id}">Tamamlandı</button>`);
    if (r.status !== "iptal" && r.status !== "tamamlandi") islemler.push(`<button class="btn kucuk tehlike" data-islem="iptal" data-id="${r.id}">İptal et</button>`);
    return `
      <article class="randevu ${r.status}">
        <span class="rozet ${r.status}">${DURUM[r.status]}</span>
        <div class="tarih">${esc(fmtTam.format(new Date(r.start_at)))}</div>
        <div>${esc(r.topics ? r.topics.name : "")}</div>
        <dl>
          ${satir("Danışan", r.client_name + (r.client_age !== null ? ", " + r.client_age + " yaş" : ""))}
          ${satir("Kimin için", KIMIN[r.client_type])}
          ${satir("Okul / sınıf", r.school_grade)}
          ${r.client_type !== "yetiskin" ? satir("İletişim", r.contact_name) : ""}
          ${satir("Telefon", r.phone)}
          ${satir("E-posta", r.email)}
          ${satir("Başvuru nedeni", r.reason)}
          ${satir("Önceki destek", destek)}
          ${satir("Talep tarihi", fmtKisa.format(new Date(r.created_at)))}
        </dl>
        <div class="islemler">
          <a class="btn kucuk ikincil" href="tel:${esc(r.phone.replace(/\s/g, ""))}">Ara</a>
          <a class="btn kucuk ikincil" href="${waLink(r.phone)}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn kucuk ikincil" data-dosya="${r.id}">${r.client_id ? "Danışan dosyası" : "Dosya aç"}</button>
          ${islemler.join("")}
        </div>
        <label for="not-${r.id}">Kendi notum <small>(yalnızca siz görürsünüz)</small></label>
        <textarea id="not-${r.id}" style="min-height:70px">${esc(r.admin_note)}</textarea>
        <div class="islemler"><button class="btn kucuk ikincil" data-not-kaydet="${r.id}">Notu kaydet</button></div>
      </article>`;
  }

  async function durumDegistir(id, yeni) {
    if (yeni === "iptal" && !confirm("Bu randevu iptal edilsin mi? Saat yeniden boşa çıkar.")) return;
    const { error } = await sb.from("appointments").update({ status: yeni }).eq("id", id);
    if (error) return bildir("Güncellenemedi.");
    bildir(DURUM[yeni]);
    randevulariYukle();
    bekleyenSay();
  }
  async function notKaydet(id) {
    const { error } = await sb.from("appointments").update({ admin_note: $("#not-" + id).value }).eq("id", id);
    bildir(error ? "Not kaydedilemedi." : "Not kaydedildi.");
  }

  // ---------- Çalışma saatleri ----------
  async function takvimAyarYukle() {
    const [{ data: saatler }, { data: ayar }] = await Promise.all([
      sb.from("working_hours").select("*").order("weekday"),
      sb.from("settings").select("*").eq("id", 1).single(),
    ]);
    $("#saat-satirlari").innerHTML = (saatler || []).map((s) => `
      <div class="saat-satiri" data-gun="${s.weekday}">
        <strong>${GUNLER[s.weekday]}</strong>
        <input type="time" value="${s.start_time.slice(0, 5)}" data-alan="bas" aria-label="${GUNLER[s.weekday]} başlangıç">
        <input type="time" value="${s.end_time.slice(0, 5)}" data-alan="bit" aria-label="${GUNLER[s.weekday]} bitiş">
        <input type="checkbox" ${s.active ? "checked" : ""} data-alan="acik" aria-label="${GUNLER[s.weekday]} açık">
      </div>`).join("");
    if (ayar) {
      $("#seans").value = String(ayar.slot_minutes);
      $("#ileri-gun").value = ayar.booking_days_ahead;
      $("#min-sure").value = ayar.min_notice_hours;
    }
    kapalilariYukle();
  }

  $("#saat-kaydet").addEventListener("click", async () => {
    const satirlar = $$(".saat-satiri").map((el) => ({
      weekday: Number(el.dataset.gun),
      start_time: $('[data-alan="bas"]', el).value,
      end_time: $('[data-alan="bit"]', el).value,
      active: $('[data-alan="acik"]', el).checked,
    }));
    if (satirlar.some((s) => !s.start_time || !s.end_time || s.end_time <= s.start_time))
      return bildir("Bitiş saati başlangıçtan sonra olmalı.");
    const r1 = await sb.from("working_hours").upsert(satirlar);
    const r2 = await sb.from("settings").update({
      slot_minutes: Number($("#seans").value),
      booking_days_ahead: Number($("#ileri-gun").value),
      min_notice_hours: Number($("#min-sure").value),
    }).eq("id", 1);
    bildir(r1.error || r2.error ? "Kaydedilemedi. Değerleri kontrol edin." : "Çalışma saatleri kaydedildi.");
  });

  async function kapalilariYukle() {
    const { data } = await sb.from("blocked_times").select("*").gte("end_at", new Date().toISOString()).order("start_at");
    const liste = $("#kapali-liste");
    if (!data || !data.length) { liste.innerHTML = '<li class="bos">Kapalı gün eklenmemiş.</li>'; return; }
    liste.innerHTML = data.map((b) => `
      <li><span>${esc(fmtKisa.format(new Date(b.start_at)))} – ${esc(fmtKisa.format(new Date(b.end_at)))}${b.note ? "<br><small>" + esc(b.note) + "</small>" : ""}</span>
      <button class="btn kucuk ikincil" data-sil="${b.id}">Kaldır</button></li>`).join("");
    $$("[data-sil]", liste).forEach((btn) => btn.addEventListener("click", async () => {
      await sb.from("blocked_times").delete().eq("id", btn.dataset.sil);
      kapalilariYukle();
    }));
  }

  $("#kapali-ekle").addEventListener("click", async () => {
    const tarih = $("#kapali-tarih").value;
    if (!tarih) return bildir("Tarih seçin.");
    const bas = $("#kapali-bas").value || "00:00";
    const bit = $("#kapali-bit").value || "23:59";
    if (bit <= bas) return bildir("Bitiş saati başlangıçtan sonra olmalı.");
    // Türkiye sabit UTC+03:00
    const { error } = await sb.from("blocked_times").insert({
      start_at: `${tarih}T${bas}:00+03:00`,
      end_at: `${tarih}T${bit}:00+03:00`,
      note: $("#kapali-not").value.trim() || null,
    });
    if (error) return bildir("Eklenemedi.");
    $("#kapali-not").value = "";
    bildir("Kapalı zaman eklendi.");
    kapalilariYukle();
  });

  // ---------- Hesap ----------
  $("#sifre-kaydet").addEventListener("click", async () => {
    const s = $("#yeni-sifre").value;
    if (s.length < 8) return bildir("Şifre en az 8 karakter olmalı.");
    const { error } = await sb.auth.updateUser({ password: s });
    $("#yeni-sifre").value = "";
    bildir(error ? "Şifre güncellenemedi." : "Şifre güncellendi.");
  });
  $("#link-kopyala").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#randevu-link").value); bildir("Bağlantı kopyalandı."); }
    catch { $("#randevu-link").select(); }
  });

  // =====================================================================
  // DANIŞAN TAKİBİ
  // =====================================================================
  const DANISAN_DURUM = { aktif: "Aktif", beklemede: "Beklemede", tamamlandi: "Tamamlandı", birakti: "Bıraktı" };
  const ODEV_DURUM = { verildi: "Verildi", yapildi: "Yapıldı", kismen: "Kısmen", yapilmadi: "Yapılmadı" };
  const KIME = { danisan: "Danışana", veli: "Veliye", aile: "Aileye" };
  const fmtGunKisa = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "short" });
  const fmtTarih = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "long", year: "numeric" });
  let danisanFiltre = "aktif";
  let aktifDanisan = null;
  let konular = null;
  let gorusmePuan = null;

  async function konulariGetir() {
    if (konular) return konular;
    const { data } = await sb.from("topics").select("id,name,category").order("sort");
    konular = data || [];
    return konular;
  }

  // ---------- Liste ----------
  $$("#danisan-filtre .cip").forEach((b) => b.addEventListener("click", () => {
    $$("#danisan-filtre .cip").forEach((x) => x.classList.remove("secili"));
    b.classList.add("secili");
    danisanFiltre = b.dataset.durum;
    danisanlariYukle();
  }));
  let araZaman;
  $("#danisan-ara").addEventListener("input", () => { clearTimeout(araZaman); araZaman = setTimeout(danisanlariYukle, 250); });

  async function danisanlariYukle() {
    const kap = $("#danisan-kartlari");
    kap.innerHTML = '<div class="yukleniyor">Yükleniyor…</div>';
    let q = sb.from("clients").select("id,full_name,client_type,age,phone,status,topics(name),sessions(session_date,progress),tasks(status),messages(sender,read_at),client_accounts(phone)").order("full_name");
    if (danisanFiltre) q = q.eq("status", danisanFiltre);
    const ara = $("#danisan-ara").value.trim().replace(/[,()]/g, " ");
    if (ara) q = q.or(`full_name.ilike.*${ara}*,phone.ilike.*${ara}*,contact_name.ilike.*${ara}*`);
    const { data, error } = await q;
    if (error) { kap.innerHTML = '<div class="hata">Danışanlar yüklenemedi.</div>'; return; }
    if (!data.length) { kap.innerHTML = '<p class="bos">Bu listede danışan yok. "+ Yeni" ile ekleyebilir ya da bir randevudan "Dosya aç" diyebilirsiniz.</p>'; return; }
    kap.innerHTML = data.map((c) => {
      const s = (c.sessions || []).slice().sort((a, b) => b.session_date.localeCompare(a.session_date));
      const son = s[0];
      const acik = (c.tasks || []).filter((t) => t.status === "verildi").length;
      const okunmamis = (c.messages || []).filter((m) => m.sender === "danisan" && !m.read_at).length;
      const girisli = c.client_accounts && (Array.isArray(c.client_accounts) ? c.client_accounts.length : true);
      return `<article class="randevu danisan-kart" data-ac="${c.id}">
        <span class="rozet ${c.status === "aktif" ? "onaylandi" : c.status === "tamamlandi" ? "tamamlandi" : "iptal"}">${DANISAN_DURUM[c.status]}</span>
        <div class="tarih">${esc(c.full_name)}${c.age !== null ? ` <small>· ${c.age} yaş</small>` : ""}</div>
        <div class="aciklama" style="margin:2px 0">${esc(c.topics ? c.topics.name : KIMIN[c.client_type])}</div>
        <div class="kart-alt">
          <span>${s.length} görüşme</span>
          <span>${son ? "Son: " + esc(fmtGunKisa.format(new Date(son.session_date))) : "Henüz görüşme yok"}</span>
          ${son && son.progress ? `<span>İlerleme ${son.progress}/10</span>` : ""}
          ${acik ? `<span class="vurgu">${acik} açık ödev</span>` : ""}
          ${okunmamis ? `<span class="vurgu-mesaj">${okunmamis} yeni mesaj</span>` : ""}
          ${girisli ? `<span>Giriş açık</span>` : ""}
        </div>
      </article>`;
    }).join("");
    $$("[data-ac]", kap).forEach((el) => el.addEventListener("click", () => dosyaAc(el.dataset.ac)));
  }

  // ---------- Danışan formu ----------
  async function danisanFormuAc(c = {}, randevuId = "") {
    const kl = await konulariGetir();
    $("#df-konu").innerHTML = '<option value="">— Seçilmedi —</option>' + kl.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join("");
    $("#df-baslik").textContent = c.id ? "Danışan bilgilerini düzenle" : "Yeni danışan";
    $("#df-id").value = c.id || "";
    $("#df-randevu").value = randevuId;
    $("#df-ad").value = c.full_name || "";
    $("#df-tur").value = c.client_type || "cocuk";
    $("#df-yas").value = c.age ?? "";
    $("#df-okul").value = c.school_grade || "";
    $("#df-veli").value = c.contact_name || "";
    $("#df-tel").value = c.phone || "";
    $("#df-eposta").value = c.email || "";
    $("#df-konu").value = c.topic_id || "";
    $("#df-hedef").value = c.goals || "";
    $("#df-not").value = c.general_notes || "";
    $("#df-durum").value = c.status || "aktif";
    bolumGoster("#danisan-form-alan");
  }
  $("#yeni-danisan").addEventListener("click", () => danisanFormuAc());
  $("#df-iptal").addEventListener("click", () => {
    if ($("#df-id").value) dosyaAc($("#df-id").value);
    else if ($("#df-randevu").value) menuAc("randevular");
    else bolumGoster("#danisan-liste");
  });

  async function randevudanDanisan(r) {
    // Aynı telefonla kayıtlı danışan var mı?
    const rakam = String(r.phone).replace(/\D/g, "").slice(-10);
    const { data: benzer } = await sb.from("clients").select("id,full_name,phone").ilike("phone", `%${rakam.slice(-7)}%`);
    const eslesen = (benzer || []).find((c) => String(c.phone || "").replace(/\D/g, "").slice(-10) === rakam);
    if (eslesen && confirm(`Bu telefonla kayıtlı bir danışan var: ${eslesen.full_name}.\n\nRandevu bu dosyaya bağlansın mı?\n(İptal derseniz yeni dosya açılır.)`)) {
      await sb.from("appointments").update({ client_id: eslesen.id }).eq("id", r.id);
      return dosyaAc(eslesen.id);
    }
    const notlar = [r.reason ? "Başvuru nedeni: " + r.reason : "", r.prior_support !== null ? "Önceki destek: " + (r.prior_support ? "Evet" + (r.prior_support_note ? " – " + r.prior_support_note : "") : "Hayır") : ""].filter(Boolean).join("\n");
    danisanFormuAc({
      full_name: r.client_name, client_type: r.client_type === "ergen" ? "ergen" : r.client_type, age: r.client_age,
      school_grade: r.school_grade, contact_name: r.client_type === "yetiskin" ? "" : r.contact_name,
      phone: r.phone, email: r.email, topic_id: r.topic_id, general_notes: notlar, status: "aktif",
    }, r.id);
  }

  $("#danisan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ad = $("#df-ad").value.trim();
    if (ad.length < 2) return bildir("Ad soyad yazın.");
    const yas = $("#df-yas").value;
    const kayit = {
      full_name: ad, client_type: $("#df-tur").value, age: yas === "" ? null : Number(yas),
      school_grade: $("#df-okul").value.trim() || null, contact_name: $("#df-veli").value.trim() || null,
      phone: $("#df-tel").value.trim() || null, email: $("#df-eposta").value.trim() || null,
      topic_id: $("#df-konu").value ? Number($("#df-konu").value) : null,
      goals: $("#df-hedef").value.trim() || null, general_notes: $("#df-not").value.trim() || null,
      status: $("#df-durum").value,
    };
    const id = $("#df-id").value;
    let sonuc;
    if (id) sonuc = await sb.from("clients").update(kayit).eq("id", id).select("id").single();
    else sonuc = await sb.from("clients").insert(kayit).select("id").single();
    if (sonuc.error) return bildir("Kaydedilemedi.");
    const randevuId = $("#df-randevu").value;
    if (randevuId) await sb.from("appointments").update({ client_id: sonuc.data.id }).eq("id", randevuId);
    bildir("Danışan kaydedildi.");
    dosyaAc(sonuc.data.id);
  });

  // ---------- Dosya ekranı ----------
  $("#dosya-geri").addEventListener("click", () => menuAc("danisanlar"));

  async function dosyaAc(id, hedef) {
    menuIsaretle("danisanlar");
    bolumGoster("#danisan-dosya");
    $("#dosya-bilgi").innerHTML = '<div class="yukleniyor">Yükleniyor…</div>';
    $("#gorusme-form").classList.add("gizli");
    $("#odev-form").classList.add("gizli");
    const { data: c, error } = await sb.from("clients").select("*, topics(name)").eq("id", id).single();
    if (error) { $("#dosya-bilgi").innerHTML = '<div class="hata">Dosya açılamadı.</div>'; return; }
    aktifDanisan = c;
    const satir = (a, b) => (b === null || b === undefined || b === "" ? "" : `<dt>${a}</dt><dd>${esc(b)}</dd>`);
    const { data: randevular } = await sb.from("appointments").select("start_at,status").eq("client_id", id).gte("start_at", new Date().toISOString()).neq("status", "iptal").order("start_at").limit(1);
    const sonraki = randevular && randevular[0];
    $("#dosya-bilgi").innerHTML = `
      <span class="rozet ${c.status === "aktif" ? "onaylandi" : c.status === "tamamlandi" ? "tamamlandi" : "iptal"}">${DANISAN_DURUM[c.status]}</span>
      <h2>${esc(c.full_name)}</h2>
      <div class="aciklama" style="margin:2px 0 6px">${esc(KIMIN[c.client_type])}${c.age !== null ? " · " + c.age + " yaş" : ""}${c.school_grade ? " · " + esc(c.school_grade) : ""}</div>
      ${sonraki ? `<div class="sonraki">Sonraki randevu: <strong>${esc(fmtTam.format(new Date(sonraki.start_at)))}</strong></div>` : ""}
      <dl>
        ${satir("Konu", c.topics ? c.topics.name : "")}
        ${satir("Veli / iletişim", c.contact_name)}
        ${satir("Telefon", c.phone)}
        ${satir("E-posta", c.email)}
        ${satir("Hedefler", c.goals)}
        ${satir("Genel notlar", c.general_notes)}
        ${satir("Dosya açılış", fmtTarih.format(new Date(c.created_at)))}
      </dl>
      <div class="islemler">
        ${c.phone ? `<a class="btn kucuk ikincil" href="tel:${esc(c.phone.replace(/\s/g, ""))}">Ara</a><a class="btn kucuk ikincil" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        <button class="btn kucuk ikincil" id="dosya-duzenle">Bilgileri düzenle</button>
        <a class="btn kucuk ikincil" href="/rapor?id=${c.id}" target="_blank" rel="noopener">Gelişim raporu</a>
      </div>`;
    $("#dosya-duzenle").addEventListener("click", () => danisanFormuAc(aktifDanisan));
    gorusmeleriYukle();
    odevleriYukle();
    girisKartiYukle();
    takipYukle();
    dosyalariYukle();
    await mesajlariYukle();
    if (hedef === "mesaj") $("#mesaj-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- Görüşmeler ----------
  function puanlariCiz(secili) {
    gorusmePuan = secili || null;
    $("#g-puan").innerHTML = Array.from({ length: 10 }, (_, i) => i + 1)
      .map((n) => `<button type="button" class="puan${n === gorusmePuan ? " secili" : ""}" data-puan="${n}">${n}</button>`).join("");
    $$("#g-puan .puan").forEach((b) => b.addEventListener("click", () => {
      const n = Number(b.dataset.puan);
      puanlariCiz(gorusmePuan === n ? null : n);
    }));
  }
  function yerelZaman(iso) {
    const d = iso ? new Date(iso) : new Date();
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
  }
  function gorusmeFormuAc(s = {}) {
    $("#g-id").value = s.id || "";
    $("#g-tarih").value = yerelZaman(s.session_date);
    $("#g-ozet").value = s.summary || "";
    $("#g-gozlem").value = s.observations || "";
    $("#g-paylasim").value = s.shared_summary || "";
    $("#g-plan").value = s.next_plan || "";
    puanlariCiz(s.progress);
    $("#gorusme-form").classList.remove("gizli");
    $("#gorusme-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#gorusme-ekle-ac").addEventListener("click", () => gorusmeFormuAc());
  $("#gorusme-iptal").addEventListener("click", () => $("#gorusme-form").classList.add("gizli"));

  $("#gorusme-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const tarih = $("#g-tarih").value;
    if (!tarih) return bildir("Tarih seçin.");
    if (!$("#g-ozet").value.trim()) return bildir("Neler görüşüldüğünü kısaca yazın.");
    const kayit = {
      client_id: aktifDanisan.id,
      session_date: `${tarih}:00+03:00`,
      summary: $("#g-ozet").value.trim(),
      observations: $("#g-gozlem").value.trim() || null,
      shared_summary: $("#g-paylasim").value.trim() || null,
      progress: gorusmePuan,
      next_plan: $("#g-plan").value.trim() || null,
    };
    const id = $("#g-id").value;
    const { error } = id ? await sb.from("sessions").update(kayit).eq("id", id) : await sb.from("sessions").insert(kayit);
    if (error) return bildir("Görüşme kaydedilemedi.");
    $("#gorusme-form").classList.add("gizli");
    bildir("Görüşme kaydedildi.");
    gorusmeleriYukle();
  });

  async function gorusmeleriYukle() {
    const { data } = await sb.from("sessions").select("*").eq("client_id", aktifDanisan.id).order("session_date", { ascending: false });
    const liste = (data || []).slice().sort((a, b) => b.session_date.localeCompare(a.session_date));
    // İlerleme grafiği (eskiden yeniye)
    const puanli = liste.filter((s) => s.progress).slice().reverse();
    const g = $("#ilerleme-grafik");
    if (!puanli.length) {
      g.innerHTML = '<p class="bos">Görüşmelere ilerleme puanı verdikçe burada gelişim grafiği oluşur.</p>';
      $("#ilerleme-ozet").textContent = "";
    } else {
      g.innerHTML = puanli.slice(-12).map((s) => `
        <div class="cubuk-kap" title="${esc(fmtTarih.format(new Date(s.session_date)))}: ${s.progress}/10">
          <span class="cubuk-deger">${s.progress}</span>
          <div class="cubuk" style="height:${s.progress * 10}%"></div>
          <span class="cubuk-tarih">${esc(fmtGunKisa.format(new Date(s.session_date)))}</span>
        </div>`).join("");
      const ilk = puanli[0].progress, son = puanli[puanli.length - 1].progress;
      const fark = son - ilk;
      $("#ilerleme-ozet").textContent = puanli.length > 1 ? `${ilk} → ${son} (${fark > 0 ? "+" : ""}${fark})` : `${son}/10`;
    }
    const kap = $("#gorusme-listesi");
    if (!liste.length) { kap.innerHTML = '<p class="bos">Henüz görüşme kaydı yok.</p>'; return; }
    kap.innerHTML = liste.map((s, i) => `
      <div class="gorusme">
        <div class="gorusme-ust">
          <strong>${liste.length - i}. görüşme · ${esc(fmtTam.format(new Date(s.session_date)))}</strong>
          ${s.progress ? `<span class="rozet onaylandi">${s.progress}/10</span>` : ""}
        </div>
        ${s.summary ? `<div class="gorusme-bolum"><span>Görüşülenler</span><p>${esc(s.summary)}</p></div>` : ""}
        ${s.observations ? `<div class="gorusme-bolum"><span>Gözlemler</span><p>${esc(s.observations)}</p></div>` : ""}
        ${s.shared_summary ? `<div class="gorusme-bolum paylasim"><span>Veliye görünen özet</span><p>${esc(s.shared_summary)}</p></div>` : ""}
        ${s.next_plan ? `<div class="gorusme-bolum"><span>Sonraki plan</span><p>${esc(s.next_plan)}</p></div>` : ""}
        <div class="islemler">
          <button class="btn kucuk ikincil" data-g-duzenle="${s.id}">Düzenle</button>
          <button class="btn kucuk ikincil" data-g-odev="${s.id}">Bu görüşmeye ödev ekle</button>
          <button class="btn kucuk ikincil" data-g-sil="${s.id}">Sil</button>
        </div>
      </div>`).join("");
    $$("[data-g-duzenle]", kap).forEach((b) => b.addEventListener("click", () => gorusmeFormuAc(liste.find((s) => s.id === b.dataset.gDuzenle))));
    $$("[data-g-odev]", kap).forEach((b) => b.addEventListener("click", () => odevFormuAc(b.dataset.gOdev)));
    $$("[data-g-sil]", kap).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Bu görüşme kaydı silinsin mi? Bu işlem geri alınamaz.")) return;
      await sb.from("sessions").delete().eq("id", b.dataset.gSil);
      bildir("Görüşme silindi.");
      gorusmeleriYukle();
    }));
  }

  // ---------- Ödevler ----------
  let odevGorusme = null;
  function odevFormuAc(gorusmeId = null) {
    odevGorusme = gorusmeId;
    $("#o-baslik").value = "";
    $("#o-aciklama").value = "";
    $("#o-kime").value = aktifDanisan && (aktifDanisan.client_type === "cocuk") ? "veli" : "danisan";
    $("#o-tarih").value = "";
    $("#odev-form").classList.remove("gizli");
    $("#odev-form").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#o-baslik").focus();
  }
  $("#odev-ekle-ac").addEventListener("click", () => odevFormuAc());
  $("#odev-iptal").addEventListener("click", () => $("#odev-form").classList.add("gizli"));

  $("#odev-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const baslik = $("#o-baslik").value.trim();
    if (baslik.length < 2) return bildir("Ödevi yazın.");
    let sessionId = odevGorusme;
    if (!sessionId) {
      const { data: son } = await sb.from("sessions").select("id").eq("client_id", aktifDanisan.id).order("session_date", { ascending: false }).limit(1);
      sessionId = son && son[0] ? son[0].id : null;
    }
    const { error } = await sb.from("tasks").insert({
      client_id: aktifDanisan.id, session_id: sessionId, title: baslik,
      description: $("#o-aciklama").value.trim() || null, assigned_to: $("#o-kime").value,
      due_date: $("#o-tarih").value || null,
    });
    if (error) return bildir("Ödev kaydedilemedi.");
    $("#odev-form").classList.add("gizli");
    bildir("Ödev eklendi.");
    odevleriYukle();
  });

  async function odevleriYukle() {
    const { data } = await sb.from("tasks").select("*").eq("client_id", aktifDanisan.id).order("created_at", { ascending: false });
    const kap = $("#odev-listesi");
    const liste = data || [];
    if (!liste.length) { kap.innerHTML = '<p class="bos">Henüz ödev verilmedi.</p>'; return; }
    const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(new Date());
    kap.innerHTML = liste.map((t) => {
      const gecikti = t.status === "verildi" && t.due_date && t.due_date < bugun;
      return `<div class="odev ${t.status}">
        <div class="odev-ust">
          <strong>${esc(t.title)}</strong>
          <span class="rozet odev-${t.status}">${ODEV_DURUM[t.status]}</span>
        </div>
        <div class="aciklama" style="margin:2px 0">${KIME[t.assigned_to]} · ${esc(fmtGunKisa.format(new Date(t.created_at)))}${t.due_date ? ` · Son tarih: <span class="${gecikti ? "gecikti" : ""}">${esc(fmtGunKisa.format(new Date(t.due_date + "T12:00:00Z")))}</span>` : ""}</div>
        ${t.description ? `<p class="odev-aciklama">${esc(t.description)}</p>` : ""}
        <div class="secenekler odev-durumlar">
          ${Object.entries(ODEV_DURUM).map(([k, v]) => `<button type="button" class="cip kucuk-cip${t.status === k ? " secili" : ""}" data-o-id="${t.id}" data-o-durum="${k}">${v}</button>`).join("")}
        </div>
        <label for="of-${t.id}">Geri bildirim <small>(nasıl gitti?)</small></label>
        <div class="satir-buton">
          <input type="text" id="of-${t.id}" value="${esc(t.feedback)}" maxlength="500">
          <button class="btn kucuk ikincil" data-o-not="${t.id}">Kaydet</button>
          <button class="btn kucuk ikincil" data-o-sil="${t.id}" aria-label="Ödevi sil">Sil</button>
        </div>
      </div>`;
    }).join("");
    $$("[data-o-durum]", kap).forEach((b) => b.addEventListener("click", async () => {
      await sb.from("tasks").update({ status: b.dataset.oDurum }).eq("id", b.dataset.oId);
      odevleriYukle();
    }));
    $$("[data-o-not]", kap).forEach((b) => b.addEventListener("click", async () => {
      const { error } = await sb.from("tasks").update({ feedback: $("#of-" + b.dataset.oNot).value.trim() || null }).eq("id", b.dataset.oNot);
      bildir(error ? "Kaydedilemedi." : "Geri bildirim kaydedildi.");
    }));
    $$("[data-o-sil]", kap).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Bu ödev silinsin mi?")) return;
      await sb.from("tasks").delete().eq("id", b.dataset.oSil);
      odevleriYukle();
    }));
  }

  // =====================================================================
  // MESAJLAR
  // =====================================================================
  const fmtMesaj = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  async function mesajlariYukle() {
    if (!aktifDanisan) return;
    const id = aktifDanisan.id;
    const { data } = await sb.from("messages").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(200);
    if (!aktifDanisan || aktifDanisan.id !== id) return;
    const liste = (data || []).slice().reverse();
    const kap = $("#mesaj-listesi");
    const enAltta = kap.scrollHeight - kap.scrollTop - kap.clientHeight < 40;
    kap.innerHTML = liste.length ? liste.map((m) => `
      <div class="balon ${m.sender === "uzman" ? "giden" : "gelen"}">
        <p>${esc(m.body)}</p>
        <small>${esc(fmtMesaj.format(new Date(m.created_at)))}${m.sender === "uzman" ? (m.read_at ? " · Okundu" : " · İletildi") : ""}</small>
      </div>`).join("") : '<p class="bos">Henüz mesaj yok.</p>';
    if (enAltta || !kap.dataset.yuklendi) kap.scrollTop = kap.scrollHeight;
    kap.dataset.yuklendi = "1";
    const okunmamis = liste.filter((m) => m.sender === "danisan" && !m.read_at).map((m) => m.id);
    if (okunmamis.length) { await sb.from("messages").update({ read_at: new Date().toISOString() }).in("id", okunmamis); mesajSay(); }
  }
  $("#mesaj-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const metin = $("#mesaj-metin").value.trim();
    if (!metin || !aktifDanisan) return;
    const btn = $("#mesaj-form button");
    btn.disabled = true;
    const { error } = await sb.from("messages").insert({ client_id: aktifDanisan.id, sender: "uzman", body: metin });
    btn.disabled = false;
    if (error) return bildir("Mesaj gönderilemedi.");
    $("#mesaj-metin").value = "";
    $("#mesaj-listesi").dataset.yuklendi = "";
    mesajlariYukle();
  });
  setInterval(() => {
    if (document.hidden) return;
    if (!$("#danisan-dosya").classList.contains("gizli")) mesajlariYukle();
    else if (!$("#panel").classList.contains("gizli")) mesajSay();
  }, 20000);

  // =====================================================================
  // DANIŞAN GİRİŞİ
  // =====================================================================
  function sifreUret() {
    const h = "abcdefghjkmnprstuvyz", r = "23456789";
    const a = new Uint32Array(7); crypto.getRandomValues(a);
    return Array.from(a).map((x, i) => (i < 4 ? h[x % h.length] : r[x % r.length])).join("");
  }
  const telGoster = (t) => `0${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6, 8)} ${t.slice(8)}`;
  function girisMesaji(tel, sifre) {
    return `Merhaba, Zambak Danışmanlık uygulamasına giriş bilgileriniz:\n\nAdres: ${location.origin}/danisan\nTelefon: ${telGoster(tel)}\nŞifre: ${sifre}\n\nUygulamadan ödevlerinizi ve gelişiminizi takip edebilir, bize mesaj yazabilirsiniz. Telefonunuzun ana ekranına eklemek için sayfa açıkken tarayıcı menüsünden "Ana ekrana ekle"yi seçebilirsiniz.`;
  }
  async function girisKartiYukle() {
    const kart = $("#giris-kart");
    const c = aktifDanisan;
    const { data } = await sb.from("client_accounts").select("phone,created_at,last_login_at").eq("client_id", c.id).maybeSingle();
    if (!aktifDanisan || aktifDanisan.id !== c.id) return;
    if (!data) {
      kart.innerHTML = `
        <h3>Danışan girişi</h3>
        <p class="aciklama">Giriş açarsanız ${c.client_type === "cocuk" ? "veli" : "danışan"} kendi telefonundan ödevlerini, ilerlemesini ve sonraki randevusunu görebilir, size mesaj yazabilir. Görüşme notlarınız ve gözlemleriniz görünmez, yalnızca "veliye görünecek özet" alanına yazdıklarınız görünür.</p>
        <div class="satir">
          <div><label for="gk-tel">Giriş telefonu</label><input type="tel" id="gk-tel" maxlength="20" value="${esc(c.phone || "")}" placeholder="05xx xxx xx xx"></div>
          <div><label for="gk-sifre">Şifre</label><input type="text" id="gk-sifre" maxlength="40" value="${sifreUret()}"></div>
        </div>
        <div class="alt-cubuk"><button type="button" class="btn" id="gk-ac">Girişi aç</button></div>`;
      $("#gk-ac").addEventListener("click", () => girisKaydet());
    } else {
      kart.innerHTML = `
        <div class="baslik-satiri"><h3>Danışan girişi</h3><span class="rozet onaylandi">Açık</span></div>
        <dl>
          <dt>Telefon</dt><dd>${esc(telGoster(data.phone))}</dd>
          <dt>Açılış</dt><dd>${esc(fmtTarih.format(new Date(data.created_at)))}</dd>
          <dt>Son giriş</dt><dd>${data.last_login_at ? esc(fmtMesaj.format(new Date(data.last_login_at))) : "Henüz giriş yapmadı"}</dd>
        </dl>
        <div id="gk-sifirla-alan" class="gizli alt-form">
          <div class="satir">
            <div><label for="gk-tel">Giriş telefonu</label><input type="tel" id="gk-tel" maxlength="20" value="${esc(telGoster(data.phone))}"></div>
            <div><label for="gk-sifre">Yeni şifre</label><input type="text" id="gk-sifre" maxlength="40" value="${sifreUret()}"></div>
          </div>
          <div class="alt-cubuk"><button type="button" class="btn" id="gk-kaydet">Kaydet</button></div>
        </div>
        <div class="islemler">
          <button type="button" class="btn kucuk ikincil" id="gk-sifirla">Şifreyi sıfırla</button>
          <button type="button" class="btn kucuk ikincil" id="gk-kapat">Girişi kapat</button>
        </div>`;
      $("#gk-sifirla").addEventListener("click", () => $("#gk-sifirla-alan").classList.toggle("gizli"));
      $("#gk-kaydet").addEventListener("click", () => girisKaydet());
      $("#gk-kapat").addEventListener("click", async () => {
        if (!confirm("Danışanın girişi kapatılsın mı? Mesajlar ve kayıtlar silinmez, sadece uygulamaya giremez.")) return;
        const { error } = await sb.rpc("danisan_hesabi_kapat", { p_client_id: c.id });
        bildir(error ? "Kapatılamadı." : "Giriş kapatıldı.");
        girisKartiYukle();
      });
    }
  }
  async function girisKaydet() {
    const tel = $("#gk-tel").value, sifre = $("#gk-sifre").value.trim();
    const { data, error } = await sb.rpc("danisan_hesabi_olustur", { p_client_id: aktifDanisan.id, p_telefon: tel, p_sifre: sifre });
    if (error) return bildir(error.message || "Kaydedilemedi.");
    await girisKartiYukle();
    const kart = $("#giris-kart");
    const kutu = document.createElement("div");
    kutu.className = "bilgi-kutu";
    kutu.innerHTML = `<strong>Giriş bilgileri hazır</strong>
      <p>Adres: ${esc(location.origin)}/danisan<br>Telefon: ${esc(telGoster(data))}<br>Şifre: ${esc(sifre)}</p>
      <p class="aciklama">Şifreyi şimdi gönderin. Güvenlik için bu ekrandan çıkınca tekrar gösterilmez.</p>
      <div class="islemler">
        <a class="btn kucuk" href="https://wa.me/90${data}?text=${encodeURIComponent(girisMesaji(data, sifre))}" target="_blank" rel="noopener">WhatsApp ile gönder</a>
        <button type="button" class="btn kucuk ikincil" id="gk-kopyala">Metni kopyala</button>
      </div>`;
    kart.appendChild(kutu);
    $("#gk-kopyala").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(girisMesaji(data, sifre)); bildir("Kopyalandı."); } catch { bildir("Kopyalanamadı."); }
    });
  }

  // =====================================================================
  // BİLDİRİMLER
  // =====================================================================
  async function bildirimKarti() {
    const d = await ZambakPush.durum(sb).catch(() => "desteklenmiyor");
    $("#bildirim-durum").textContent = ZambakPush.METIN[d];
    const b = $("#bildirim-dugme");
    b.classList.toggle("gizli", !["acik", "kapali"].includes(d));
    b.textContent = d === "acik" ? "Bildirimleri kapat" : "Bildirimleri aç";
    b.classList.toggle("ikincil", d === "acik");
    b.dataset.durum = d;
  }
  $("#bildirim-dugme").addEventListener("click", async () => {
    try {
      if ($("#bildirim-dugme").dataset.durum === "acik") { await ZambakPush.kapat(sb); bildir("Bildirimler kapatıldı."); }
      else { await ZambakPush.ac(sb); bildir("Bildirimler açıldı."); }
    } catch (e) { bildir(e.message); }
    bildirimKarti();
  });
  $("#bant-ac").addEventListener("click", async () => {
    try { await ZambakPush.ac(sb); bildir("Bildirimler açıldı."); $("#bildirim-bant").classList.add("gizli"); }
    catch (e) { bildir(e.message); }
  });

  // =====================================================================
  // GÜNLÜK TAKİP
  // =====================================================================
  const HAZIR_TAKIP = [
    { ad: "Günün en yüksek öfke seviyesi", min: 0, max: 10, birim: "", dusuk: 1 },
    { ad: "Kaygı seviyesi", min: 0, max: 10, birim: "", dusuk: 1 },
    { ad: "Ödeve odaklanma süresi", min: 0, max: 120, birim: "dk", dusuk: 0 },
    { ad: "Uyku süresi", min: 0, max: 14, birim: "saat", dusuk: 0 },
    { ad: "Ekran süresi", min: 0, max: 600, birim: "dk", dusuk: 1 },
    { ad: "Günün genel ruh hali", min: 0, max: 10, birim: "", dusuk: 0 },
  ];
  $("#takip-hazir").innerHTML = HAZIR_TAKIP.map((h, i) => `<button type="button" class="cip kucuk-cip" data-hazir="${i}">${esc(h.ad)}</button>`).join("");
  $$("#takip-hazir [data-hazir]").forEach((b) => b.addEventListener("click", () => {
    const h = HAZIR_TAKIP[b.dataset.hazir];
    $("#tk-ad").value = h.ad; $("#tk-min").value = h.min; $("#tk-max").value = h.max; $("#tk-birim").value = h.birim; $("#tk-yon").value = String(h.dusuk);
  }));
  $("#takip-ekle-ac").addEventListener("click", () => { $("#takip-form").classList.remove("gizli"); $("#tk-ad").focus(); });
  $("#takip-iptal").addEventListener("click", () => $("#takip-form").classList.add("gizli"));
  $("#takip-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ad = $("#tk-ad").value.trim(), mn = Number($("#tk-min").value), mx = Number($("#tk-max").value);
    if (ad.length < 2) return bildir("Ne takip edileceğini yazın.");
    if (!(mx > mn)) return bildir("En yüksek değer en düşükten büyük olmalı.");
    const { error } = await sb.from("tracking_metrics").insert({ client_id: aktifDanisan.id, name: ad, min_value: mn, max_value: mx, unit: $("#tk-birim").value.trim() || null, low_is_good: $("#tk-yon").value === "1" });
    if (error) return bildir("Eklenemedi.");
    $("#takip-form").classList.add("gizli"); $("#tk-ad").value = "";
    bildir("Takip eklendi. Veli kendi ekranında görecek.");
    takipYukle();
  });

  window.takipGrafik = function (kayitlar, min, max, dusukIyi, gunSayisi = 14) {
    const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(new Date());
    const g = [];
    for (let i = gunSayisi - 1; i >= 0; i--) { const d = new Date(bugun + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - i); g.push(d.toISOString().slice(0, 10)); }
    const map = Object.fromEntries(kayitlar.map((k) => [String(k.gun).slice(0, 10), Number(k.deger)]));
    const W = 320, H = 120, bw = W / gunSayisi;
    const renk = (v) => { const o = (v - min) / (max - min); const iyi = dusukIyi ? 1 - o : o; return iyi >= 0.6 ? "#4c6b3a" : iyi >= 0.35 ? "#d1a23a" : "#a33a2b"; };
    let svg = `<svg viewBox="0 0 ${W} ${H + 22}" class="takip-svg" role="img" aria-label="Son ${gunSayisi} gün">`;
    svg += `<line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#ece4c9"/>`;
    g.forEach((gun, i) => {
      const x = i * bw + bw * 0.18, w = bw * 0.64, v = map[gun];
      if (v === undefined) svg += `<circle cx="${x + w / 2}" cy="${H - 3}" r="2" fill="#cfc6a6"/>`;
      else {
        const h = Math.max(4, ((v - min) / (max - min)) * (H - 16));
        svg += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" rx="3" fill="${renk(v)}"/><text x="${x + w / 2}" y="${H - h - 3}" font-size="9" text-anchor="middle" fill="#2a2f25">${Math.round(v * 10) / 10}</text>`;
      }
      if (i % 2 === 0 || gunSayisi <= 7) svg += `<text x="${x + w / 2}" y="${H + 14}" font-size="8.5" text-anchor="middle" fill="#6b7064">${Number(gun.slice(8))}</text>`;
    });
    return svg + "</svg>";
  };

  async function takipYukle() {
    const id = aktifDanisan.id;
    const [{ data: olcutler }, { data: kayitlar }] = await Promise.all([
      sb.from("tracking_metrics").select("*").eq("client_id", id).order("created_at"),
      sb.from("tracking_entries").select("metric_id,entry_date,value,note").eq("client_id", id).order("entry_date", { ascending: false }).limit(500),
    ]);
    if (!aktifDanisan || aktifDanisan.id !== id) return;
    const kap = $("#takip-listesi");
    const o = olcutler || [];
    if (!o.length) { kap.innerHTML = '<p class="bos">Henüz takip eklenmedi. Örneğin öfke kontrolünde "Günün en yüksek öfke seviyesi" eklenebilir.</p>'; return; }
    kap.innerHTML = o.map((m) => {
      const k = (kayitlar || []).filter((e) => e.metric_id === m.id).map((e) => ({ gun: e.entry_date, deger: e.value, not: e.note }));
      const son7 = k.filter((e) => (Date.now() - Date.parse(e.gun)) / 864e5 <= 7), onceki7 = k.filter((e) => { const g = (Date.now() - Date.parse(e.gun)) / 864e5; return g > 7 && g <= 14; });
      const ort = (a) => (a.length ? a.reduce((t, e) => t + Number(e.deger), 0) / a.length : null);
      const o1 = ort(son7), o0 = ort(onceki7);
      let egilim = "";
      if (o1 !== null && o0 !== null) {
        const fark = o1 - o0, iyi = m.low_is_good ? fark < 0 : fark > 0;
        egilim = Math.abs(fark) < 0.05 ? " · değişim yok" : ` · <span class="${iyi ? "iyi" : "kotu"}">${fark > 0 ? "▲" : "▼"} ${Math.abs(Math.round(fark * 10) / 10)}</span> önceki haftaya göre`;
      }
      const notlar = k.filter((e) => e.not).slice(0, 3);
      return `<div class="takip ${m.active ? "" : "pasif"}">
        <div class="odev-ust"><strong>${esc(m.name)}</strong><span class="aciklama">${m.min_value}–${m.max_value}${m.unit ? " " + esc(m.unit) : ""}</span></div>
        <div class="aciklama" style="margin:2px 0 4px">${o1 !== null ? `Son 7 gün ortalaması: <strong>${Math.round(o1 * 10) / 10}</strong>${egilim}` : "Henüz giriş yapılmadı."}</div>
        ${takipGrafik(k, Number(m.min_value), Number(m.max_value), m.low_is_good)}
        ${notlar.length ? `<div class="takip-notlar">${notlar.map((n) => `<p><span>${esc(fmtGunKisa.format(new Date(n.gun + "T12:00:00Z")))}</span> ${esc(n.not)}</p>`).join("")}</div>` : ""}
        <div class="islemler">
          <button type="button" class="btn kucuk ikincil" data-tk-aktif="${m.id}" data-deger="${m.active ? 0 : 1}">${m.active ? "Takibi durdur" : "Yeniden başlat"}</button>
          <button type="button" class="btn kucuk ikincil" data-tk-sil="${m.id}">Sil</button>
        </div>
      </div>`;
    }).join("");
    $$("[data-tk-aktif]", kap).forEach((b) => b.addEventListener("click", async () => {
      await sb.from("tracking_metrics").update({ active: b.dataset.deger === "1" }).eq("id", b.dataset.tkAktif); takipYukle();
    }));
    $$("[data-tk-sil]", kap).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Bu takip ve tüm girişleri silinsin mi?")) return;
      await sb.from("tracking_metrics").delete().eq("id", b.dataset.tkSil); takipYukle();
    }));
  }

  // =====================================================================
  // DOSYALAR
  // =====================================================================
  const boyut = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  async function dosyalariYukle() {
    const id = aktifDanisan.id;
    const { data } = await sb.from("client_files").select("*").eq("client_id", id).order("created_at", { ascending: false });
    if (!aktifDanisan || aktifDanisan.id !== id) return;
    const kap = $("#dosya-listesi");
    const liste = data || [];
    if (!liste.length) { kap.innerHTML = '<p class="bos">Henüz dosya yüklenmedi.</p>'; return; }
    kap.innerHTML = liste.map((f) => `<div class="dosya">
        <button type="button" class="dosya-ad" data-ac-dosya="${esc(f.path)}"><span class="dosya-ikon">${/pdf/.test(f.mime || "") ? "PDF" : /image/.test(f.mime || "") ? "IMG" : "DOC"}</span>
          <span><strong>${esc(f.name)}</strong><small>${esc(fmtGunKisa.format(new Date(f.created_at)))} · ${boyut(f.size_bytes || 0)}</small></span></button>
        <div class="islemler">
          <button type="button" class="cip kucuk-cip${f.shared ? " secili" : ""}" data-paylas="${f.id}" data-deger="${f.shared ? 0 : 1}">${f.shared ? "Veliye açık" : "Sadece ben"}</button>
          <button type="button" class="btn kucuk ikincil" data-dosya-sil="${f.id}" data-yol="${esc(f.path)}">Sil</button>
        </div>
      </div>`).join("");
    $$("[data-ac-dosya]", kap).forEach((b) => b.addEventListener("click", async () => {
      const w = window.open("", "_blank");
      const { data: u, error } = await sb.storage.from("danisan-dosyalari").createSignedUrl(b.dataset.acDosya, 300);
      if (error) { if (w) w.close(); return bildir("Dosya açılamadı."); }
      if (w) w.location = u.signedUrl; else location.href = u.signedUrl;
    }));
    $$("[data-paylas]", kap).forEach((b) => b.addEventListener("click", async () => {
      await sb.from("client_files").update({ shared: b.dataset.deger === "1" }).eq("id", b.dataset.paylas);
      bildir(b.dataset.deger === "1" ? "Veli artık bu dosyayı görebilir." : "Dosya veliden gizlendi.");
      dosyalariYukle();
    }));
    $$("[data-dosya-sil]", kap).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Dosya kalıcı olarak silinsin mi?")) return;
      await sb.storage.from("danisan-dosyalari").remove([b.dataset.yol]);
      await sb.from("client_files").delete().eq("id", b.dataset.dosyaSil);
      dosyalariYukle();
    }));
  }
  $("#dosya-input").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f || !aktifDanisan) return;
    if (f.size > 20 * 1048576) return bildir("Dosya en fazla 20 MB olabilir.");
    const durum = $("#dosya-durum");
    durum.textContent = `${f.name} yükleniyor…`; durum.classList.remove("gizli");
    const temiz = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
    const yol = `${aktifDanisan.id}/${Date.now()}-${temiz}`;
    const { error } = await sb.storage.from("danisan-dosyalari").upload(yol, f, { contentType: f.type || "application/octet-stream" });
    if (error) { durum.classList.add("gizli"); return bildir("Yüklenemedi. Dosya türü PDF, görsel ya da Word olmalı."); }
    const r = await sb.from("client_files").insert({ client_id: aktifDanisan.id, name: f.name, path: yol, mime: f.type, size_bytes: f.size });
    durum.classList.add("gizli");
    if (r.error) return bildir("Kaydedilemedi.");
    bildir("Dosya yüklendi. Veliye açmak için “Sadece ben” düğmesine dokunun.");
    dosyalariYukle();
  });

  // =====================================================================
  // AYLIK ÖZET
  // =====================================================================
  let seciliAy = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ }).format(new Date()).slice(0, 7);
  const ayEkle = (a, n) => { const d = new Date(a + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  $("#aylik-ac").addEventListener("click", () => { menuIsaretle("bugun"); $("#bolum-baslik").textContent = "Aylık özet"; bolumGoster("#aylik"); aylikYukle(); });
  $("#aylik-geri").addEventListener("click", () => menuAc("bugun"));
  $("#ay-geri").addEventListener("click", () => { seciliAy = ayEkle(seciliAy, -1); aylikYukle(); });
  $("#ay-ileri").addEventListener("click", () => { seciliAy = ayEkle(seciliAy, 1); aylikYukle(); });
  async function aylikYukle() {
    $("#ay-baslik").textContent = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(seciliAy + "-15T12:00:00Z"));
    const kap = $("#aylik-icerik");
    kap.innerHTML = '<div class="yukleniyor">Hesaplanıyor…</div>';
    const [{ data: o, error }, { data: oo }] = await Promise.all([
      sb.rpc("admin_aylik_ozet", { p_ay: seciliAy + "-01" }),
      sb.rpc("admin_aylik_ozet", { p_ay: ayEkle(seciliAy, -1) + "-01" }),
    ]);
    if (error || !o) { kap.innerHTML = '<div class="hata">Özet hesaplanamadı.</div>'; return; }
    const fark = (a, b) => { if (!oo) return ""; const d = a - b; return d === 0 ? "" : `<small class="${d > 0 ? "iyi" : "kotu"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)} geçen aya göre</small>`; };
    const kutu = (ad, v, onceki) => `<div class="metrik"><span>${ad}</span><strong>${v}</strong>${onceki !== undefined ? fark(v, onceki) : ""}</div>`;
    const odevOran = o.odev_verilen ? Math.round(((o.odev_yapilan + o.odev_kismen * 0.5) / o.odev_verilen) * 100) : null;
    const enCok = Math.max(1, ...o.konular.map((k) => k.adet));
    kap.innerHTML = `
      <div class="metrikler">
        ${kutu("Yapılan görüşme", o.gorusme, oo && oo.gorusme)}
        ${kutu("Görüşülen danışan", o.gorusulen_danisan, oo && oo.gorusulen_danisan)}
        ${kutu("Yeni danışan", o.yeni_danisan, oo && oo.yeni_danisan)}
        ${kutu("Aktif danışan", o.aktif_danisan)}
      </div>
      <div class="randevu">
        <h3>Randevular</h3>
        <dl><dt>Gelen talep</dt><dd>${o.randevu_talep}</dd><dt>Gerçekleşen / planlanan</dt><dd>${o.randevu_gerceklesen}</dd><dt>İptal</dt><dd>${o.randevu_iptal}</dd></dl>
      </div>
      <div class="randevu">
        <h3>Talep gelen konular</h3>
        ${o.konular.length ? o.konular.map((k) => `<div class="konu-cubuk"><span>${esc(k.ad)}</span><div><i style="width:${(k.adet / enCok) * 100}%"></i></div><b>${k.adet}</b></div>`).join("") : '<p class="bos">Bu ay randevu talebi yok.</p>'}
      </div>
      <div class="randevu">
        <h3>Ödevler ve takip</h3>
        <dl><dt>Verilen ödev</dt><dd>${o.odev_verilen}</dd><dt>Yapılan</dt><dd>${o.odev_yapilan}${o.odev_kismen ? ` (+${o.odev_kismen} kısmen)` : ""}</dd>
        <dt>Tamamlanma</dt><dd>${odevOran === null ? "–" : "%" + odevOran}</dd><dt>Günlük takip girişi</dt><dd>${o.takip_girisi}</dd><dt>Mesaj</dt><dd>${o.mesaj}</dd></dl>
      </div>`;
  }

  baslat();
})();
