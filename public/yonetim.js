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
    menuAc("bugun");
  }

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
    ["#bugun", "#randevular", "#takvim-ayar", "#hesap-ayar", "#danisan-liste", "#danisan-dosya", "#danisan-form-alan"].forEach((s) =>
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
    else { bolumGoster("#takvim-ayar", "#hesap-ayar"); takvimAyarYukle(); }
    bekleyenSay();
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
    let q = sb.from("clients").select("id,full_name,client_type,age,phone,status,topics(name),sessions(session_date,progress),tasks(status)").order("full_name");
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
      return `<article class="randevu danisan-kart" data-ac="${c.id}">
        <span class="rozet ${c.status === "aktif" ? "onaylandi" : c.status === "tamamlandi" ? "tamamlandi" : "iptal"}">${DANISAN_DURUM[c.status]}</span>
        <div class="tarih">${esc(c.full_name)}${c.age !== null ? ` <small>· ${c.age} yaş</small>` : ""}</div>
        <div class="aciklama" style="margin:2px 0">${esc(c.topics ? c.topics.name : KIMIN[c.client_type])}</div>
        <div class="kart-alt">
          <span>${s.length} görüşme</span>
          <span>${son ? "Son: " + esc(fmtGunKisa.format(new Date(son.session_date))) : "Henüz görüşme yok"}</span>
          ${son && son.progress ? `<span>İlerleme ${son.progress}/10</span>` : ""}
          ${acik ? `<span class="vurgu">${acik} açık ödev</span>` : ""}
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

  async function dosyaAc(id) {
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
      </div>`;
    $("#dosya-duzenle").addEventListener("click", () => danisanFormuAc(aktifDanisan));
    gorusmeleriYukle();
    odevleriYukle();
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

  baslat();
})();
