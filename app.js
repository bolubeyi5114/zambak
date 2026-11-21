(function () {
  const C = window.ZAMBAK;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const durum = {
    adim: 1,
    konu: null,        // {id, name}
    slotlar: [],       // ISO metinleri
    gun: null,         // "YYYY-MM-DD"
    slot: null,        // ISO
    kimin: null,
    destek: null,
    seansDk: 60,
  };

  // ---------- API ----------
  async function api(yol, govde) {
    const r = await fetch(C.SUPABASE_URL + "/rest/v1/" + yol, {
      method: govde ? "POST" : "GET",
      headers: { apikey: C.SUPABASE_KEY, "Content-Type": "application/json" },
      body: govde ? JSON.stringify(govde) : undefined,
    });
    const veri = await r.json().catch(() => null);
    if (!r.ok) throw new Error((veri && veri.message) || "Bir sorun oluştu. Lütfen tekrar deneyin.");
    return veri;
  }

  // ---------- Tarih yardımcıları (İstanbul saatine göre) ----------
  const fmtGun = new Intl.DateTimeFormat("en-CA", { timeZone: C.TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtSaat = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, hour: "2-digit", minute: "2-digit" });
  const fmtUzun = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, weekday: "long", day: "numeric", month: "long" });
  const gunAnahtari = (iso) => fmtGun.format(new Date(iso));
  function bugunAnahtari() { return fmtGun.format(new Date()); }
  function gunEkle(anahtar, n) {
    const d = new Date(anahtar + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const GUN_ADLARI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const AY_ADLARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

  // ---------- Adım geçişleri ----------
  function adimaGit(n) {
    durum.adim = n;
    $$("[data-adim]").forEach((el) => el.classList.toggle("gizli", Number(el.dataset.adim) !== n));
    $$(".adimlar span").forEach((s, i) => s.classList.toggle("aktif", i < Math.min(n, 4)));
    $(".adimlar").classList.toggle("gizli", n === 5);
    $("#sihirbaz").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $$("[data-geri]").forEach((b) => b.addEventListener("click", () => adimaGit(Number(b.dataset.geri))));

  // ---------- Adım 1: Konular ----------
  async function konulariYukle() {
    try {
      const konular = await api("topics?select=id,name,category,sort&active=eq.true&order=sort");
      const gruplar = {};
      konular.forEach((k) => (gruplar[k.category] = gruplar[k.category] || []).push(k));
      const kap = $("#konular");
      kap.innerHTML = "";
      ["Rehberlik", "Psikolojik Danışmanlık", "Aile ve Çift"].forEach((kat) => {
        if (!gruplar[kat]) return;
        const baslik = document.createElement("div");
        baslik.className = "kategori";
        baslik.textContent = kat;
        const liste = document.createElement("div");
        liste.className = "secenekler";
        gruplar[kat].forEach((k) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "cip";
          b.textContent = k.name;
          b.addEventListener("click", () => {
            $$(".cip", kap).forEach((x) => x.classList.remove("secili"));
            b.classList.add("secili");
            durum.konu = k;
            $("#ileri-1").disabled = false;
          });
          liste.appendChild(b);
        });
        kap.append(baslik, liste);
      });
    } catch (e) {
      $("#konular").innerHTML = '<div class="hata">Konular yüklenemedi. Sayfayı yenileyin.</div>';
    }
  }
  $("#ileri-1").addEventListener("click", () => { adimaGit(2); takvimiYukle(); });

  // ---------- Adım 2: Takvim ----------
  async function takvimiYukle() {
    const bugun = bugunAnahtari();
    try {
      const [slotlar, ayar] = await Promise.all([
        api("rpc/get_available_slots", { p_from: bugun, p_to: gunEkle(bugun, 60) }),
        api("settings?select=slot_minutes,booking_days_ahead"),
      ]);
      durum.slotlar = slotlar.map((s) => s.slot_start);
      if (ayar && ayar[0]) {
        durum.seansDk = ayar[0].slot_minutes;
        $("#seans-sure").textContent = ayar[0].slot_minutes;
        gunleriCiz(bugun, ayar[0].booking_days_ahead);
      } else gunleriCiz(bugun, 30);
    } catch (e) {
      $("#gunler").innerHTML = '<div class="hata">Takvim yüklenemedi. Lütfen tekrar deneyin.</div>';
    }
  }

  function gunleriCiz(bugun, gunSayisi) {
    const sayac = {};
    durum.slotlar.forEach((s) => { const g = gunAnahtari(s); sayac[g] = (sayac[g] || 0) + 1; });
    const kap = $("#gunler");
    kap.innerHTML = "";
    let ilkUygun = null;
    for (let i = 0; i <= gunSayisi; i++) {
      const g = gunEkle(bugun, i);
      const d = new Date(g + "T12:00:00Z");
      const adet = sayac[g] || 0;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gun" + (adet ? "" : " dolu");
      b.disabled = !adet;
      b.dataset.gun = g;
      b.innerHTML =
        `<span class="ad">${i === 0 ? "Bugün" : i === 1 ? "Yarın" : GUN_ADLARI[d.getUTCDay()]}</span>` +
        `<span class="no">${d.getUTCDate()}</span><span class="ay">${AY_ADLARI[d.getUTCMonth()]}</span>` +
        `<span class="say">${adet ? adet + " boş" : "dolu"}</span>`;
      b.addEventListener("click", () => gunSec(g));
      kap.appendChild(b);
      if (adet && !ilkUygun) ilkUygun = g;
    }
    if (durum.gun && sayac[durum.gun]) gunSec(durum.gun);
    else if (ilkUygun) gunSec(ilkUygun);
    else $("#saatler-kap").innerHTML = '<p class="bos">Önümüzdeki günlerde boş saat bulunmuyor. Lütfen bizi arayın.</p>';
  }

  function gunSec(g) {
    durum.gun = g;
    $$(".gun").forEach((b) => b.classList.toggle("secili", b.dataset.gun === g));
    const secili = $(`.gun[data-gun="${g}"]`);
    if (secili) secili.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    const slotlar = durum.slotlar.filter((s) => gunAnahtari(s) === g);
    const kap = $("#saatler-kap");
    kap.innerHTML = `<h3 style="margin-top:8px">${fmtUzun.format(new Date(g + "T12:00:00Z"))}</h3>`;
    const izgara = document.createElement("div");
    izgara.className = "saatler";
    slotlar.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "saat" + (s === durum.slot ? " secili" : "");
      b.textContent = fmtSaat.format(new Date(s));
      b.addEventListener("click", () => {
        $$(".saat").forEach((x) => x.classList.remove("secili"));
        b.classList.add("secili");
        durum.slot = s;
        $("#ileri-2").disabled = false;
      });
      izgara.appendChild(b);
    });
    kap.appendChild(izgara);
    $("#ileri-2").disabled = !slotlar.includes(durum.slot);
  }
  $("#ileri-2").addEventListener("click", () => adimaGit(3));

  // ---------- Adım 3: Form ----------
  function tekSecim(kapSec, alan, sonra) {
    $$(kapSec + " .cip").forEach((b) =>
      b.addEventListener("click", () => {
        $$(kapSec + " .cip").forEach((x) => x.classList.remove("secili"));
        b.classList.add("secili");
        durum[alan] = b.dataset.deger;
        if (sonra) sonra(b.dataset.deger);
      })
    );
  }
  tekSecim("#kimin", "kimin", (d) => {
    const cocuk = d === "cocuk" || d === "ergen";
    $("#okul-alani").classList.toggle("gizli", !cocuk);
    $("#veli-alani").classList.toggle("gizli", d === "yetiskin");
    $("#veli-etiket").textContent = cocuk ? "(veli)" : d === "cift_aile" ? "(iletişim kurulacak kişi)" : "";
  });
  tekSecim("#destek", "destek", (d) => $("#destek-not-alani").classList.toggle("gizli", d !== "evet"));

  function formHatasi(m) {
    const el = $("#form-hata");
    el.textContent = m;
    el.classList.toggle("gizli", !m);
    if (m) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function formVerisi() {
    const v = (id) => $(id).value.trim();
    const yas = v("#yas");
    return {
      kimin: durum.kimin,
      danisan: v("#danisan"),
      yas: yas === "" ? null : Number(yas),
      okul: durum.kimin === "cocuk" || durum.kimin === "ergen" ? v("#okul") : "",
      iletisim: durum.kimin === "yetiskin" ? v("#danisan") : v("#iletisim-adi"),
      telefon: v("#telefon"),
      eposta: v("#eposta"),
      neden: v("#neden"),
      destek: durum.destek === null ? null : durum.destek === "evet",
      destekNot: durum.destek === "evet" ? v("#destek-not") : "",
      kvkk: $("#kvkk").checked,
    };
  }

  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formVerisi();
    const rakam = f.telefon.replace(/\D/g, "");
    if (!f.kimin) return formHatasi("Randevunun kimin için olduğunu seçin.");
    if (f.danisan.length < 2) return formHatasi("Danışanın adını soyadını yazın.");
    if (f.yas !== null && (isNaN(f.yas) || f.yas < 0 || f.yas > 120)) return formHatasi("Yaşı kontrol edin.");
    if (f.iletisim.length < 2) return formHatasi("Adınızı soyadınızı yazın.");
    if (rakam.length < 10 || rakam.length > 13) return formHatasi("Geçerli bir telefon numarası yazın.");
    if (f.eposta && !/^\S+@\S+\.\S+$/.test(f.eposta)) return formHatasi("E-posta adresini kontrol edin.");
    if (!f.kvkk) return formHatasi("Devam etmek için açık rıza kutusunu işaretleyin.");
    formHatasi("");
    ozetiCiz(f);
    adimaGit(4);
  });

  const KIMIN_METIN = { cocuk: "Çocuk", ergen: "Ergen", yetiskin: "Yetişkin (kendisi)", cift_aile: "Çift / Aile" };
  function ozetiCiz(f) {
    const satirlar = [
      ["Konu", durum.konu.name],
      ["Tarih", fmtUzun.format(new Date(durum.slot))],
      ["Saat", fmtSaat.format(new Date(durum.slot))],
      ["Danışan", f.danisan + (f.yas !== null ? ", " + f.yas + " yaş" : "")],
      ["Kimin için", KIMIN_METIN[f.kimin]],
      ["Telefon", f.telefon],
    ];
    const kap = $("#ozet");
    kap.innerHTML = "";
    satirlar.forEach(([a, b]) => {
      const d = document.createElement("div");
      const s1 = document.createElement("span"); s1.textContent = a;
      const s2 = document.createElement("span"); s2.textContent = b;
      d.append(s1, s2);
      kap.appendChild(d);
    });
  }

  // ---------- Adım 4: Gönder ----------
  $("#gonder").addEventListener("click", async () => {
    const btn = $("#gonder");
    const hata = $("#gonder-hata");
    hata.classList.add("gizli");
    btn.disabled = true;
    btn.textContent = "Gönderiliyor…";
    const f = formVerisi();
    try {
      await api("rpc/book_appointment", {
        p_start: durum.slot,
        p_topic_id: durum.konu.id,
        p_client_type: f.kimin,
        p_client_name: f.danisan,
        p_client_age: f.yas,
        p_school_grade: f.okul,
        p_contact_name: f.iletisim,
        p_phone: f.telefon,
        p_email: f.eposta,
        p_reason: f.neden,
        p_prior_support: f.destek,
        p_prior_support_note: f.destekNot,
        p_kvkk: f.kvkk,
      });
      $("#basari-metin").textContent =
        `${fmtUzun.format(new Date(durum.slot))}, saat ${fmtSaat.format(new Date(durum.slot))} için talebiniz uzmanımıza iletildi.`;
      adimaGit(5);
    } catch (e) {
      hata.textContent = e.message;
      hata.classList.remove("gizli");
      if (/müsait|doldu/i.test(e.message)) {
        durum.slot = null;
        setTimeout(() => { adimaGit(2); takvimiYukle(); }, 1800);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Randevuyu talep et";
    }
  });

  // ---------- Başlangıç ----------
  $("#uzman-adi").textContent = C.UZMAN;
  $("#tel-link").textContent = C.TELEFON;
  $("#tel-link").href = "tel:" + C.TELEFON.replace(/\s/g, "");
  $("#adres").textContent = C.ADRES;
  adimaGit(1);
  window.scrollTo(0, 0);
  konulariYukle();
})();
