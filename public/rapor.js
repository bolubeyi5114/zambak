(function () {
  const C = window.ZAMBAK;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fT = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "long", year: "numeric" });
  const fK = new Intl.DateTimeFormat("tr-TR", { timeZone: C.TZ, day: "numeric", month: "short" });
  const KIMIN = { cocuk: "Çocuk", ergen: "Ergen", yetiskin: "Yetişkin", cift_aile: "Çift / Aile" };
  const ODEV = { verildi: "Devam ediyor", yapildi: "Yapıldı", kismen: "Kısmen", yapilmadi: "Yapılmadı" };
  const KIME = { danisan: "Danışan", veli: "Veli", aile: "Aile" };
  const id = new URLSearchParams(location.search).get("id");
  let veri = null;

  function cizgiGrafik(noktalar) {
    if (!noktalar.length) return '<p style="color:#6b7064">Bu dönemde ilerleme puanı verilmemiş.</p>';
    const W = 700, H = 200, P = 34;
    const x = (i) => P + (noktalar.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (noktalar.length - 1));
    const y = (v) => H - P - ((v - 1) / 9) * (H - 2 * P);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="İlerleme grafiği">`;
    [1, 4, 7, 10].forEach((v) => { s += `<line x1="${P}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#f0ead6"/><text x="${P - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#6b7064">${v}</text>`; });
    s += `<polyline fill="none" stroke="#4c6b3a" stroke-width="3" stroke-linejoin="round" points="${noktalar.map((n, i) => `${x(i)},${y(n.v)}`).join(" ")}"/>`;
    noktalar.forEach((n, i) => { s += `<circle cx="${x(i)}" cy="${y(n.v)}" r="5" fill="#2f4a22"/><text x="${x(i)}" y="${y(n.v) - 10}" font-size="12" font-weight="700" text-anchor="middle" fill="#2f4a22">${n.v}</text><text x="${x(i)}" y="${H - 10}" font-size="10.5" text-anchor="middle" fill="#6b7064">${esc(fK.format(new Date(n.t)))}</text>`; });
    return s + "</svg>";
  }
  function miniGrafik(kayitlar, min, max) {
    if (!kayitlar.length) return "";
    const W = 360, H = 70, n = kayitlar.length, bw = W / Math.max(n, 1);
    let s = `<svg viewBox="0 0 ${W} ${H}"><line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="#ece4c9"/>`;
    kayitlar.forEach((k, i) => { const h = Math.max(3, ((k.value - min) / (max - min)) * (H - 6)); s += `<rect x="${i * bw + bw * 0.15}" y="${H - 1 - h}" width="${bw * 0.7}" height="${h}" rx="2" fill="#a1af83"/>`; });
    return s + "</svg>";
  }

  function ciz() {
    const { c, gorusmeler, odevler, olcutler, kayitlar } = veri;
    const gun = Number($("#donem").value);
    const bas = gun ? Date.now() - gun * 864e5 : 0;
    const notlar = $("#notlar").checked;
    const G = gorusmeler.filter((s) => Date.parse(s.session_date) >= bas);
    const O = odevler.filter((t) => Date.parse(t.created_at) >= bas);
    const yapilan = O.filter((t) => t.status === "yapildi").length, kismen = O.filter((t) => t.status === "kismen").length;
    const oran = O.length ? Math.round(((yapilan + kismen * 0.5) / O.length) * 100) : null;
    const puan = G.filter((s) => s.progress).map((s) => ({ t: s.session_date, v: s.progress }));
    const donemBas = gun ? new Date(bas) : new Date(G.length ? G[0].session_date : c.created_at);
    const takipHtml = olcutler.map((m) => {
      const k = kayitlar.filter((e) => e.metric_id === m.id && Date.parse(e.entry_date) >= bas).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      if (!k.length) return "";
      const ilk = k.slice(0, 7), son = k.slice(-7);
      const ort = (a) => Math.round((a.reduce((t, e) => t + Number(e.value), 0) / a.length) * 10) / 10;
      return `<div class="takip"><div><p><b>${esc(m.name)}</b></p><p>İlk hafta ortalaması: <b>${ort(ilk)}</b>${m.unit ? " " + esc(m.unit) : ""}</p>
        <p>Son hafta ortalaması: <b>${ort(son)}</b>${m.unit ? " " + esc(m.unit) : ""}</p><p style="color:#6b7064;font-size:.85rem">${k.length} günlük kayıt · ${m.low_is_good ? "düşük değer olumlu" : "yüksek değer olumlu"}</p></div>
        <div class="grafik">${miniGrafik(k, Number(m.min_value), Number(m.max_value))}</div></div>`;
    }).join("");
    const ozetler = G.filter((s) => s.shared_summary || (notlar && (s.summary || s.observations)));
    const deg = $("#degerlendirme").value.trim();
    $("#sayfa").innerHTML = `
      <div class="ust"><img src="/logo.webp" alt="Zambak Danışmanlık">
        <div><h1>Gelişim Raporu</h1><p>Zambak Danışmanlık · Uzm. ${esc(C.UZMAN)}</p></div>
        <div class="tarih">${esc(fT.format(new Date()))}</div></div>
      <h2>Danışan bilgileri</h2>
      <table class="bilgi">
        <tr><td>Danışan</td><td><b>${esc(c.full_name)}</b></td></tr>
        <tr><td>Bilgi</td><td>${esc(KIMIN[c.client_type])}${c.age !== null ? ", " + c.age + " yaş" : ""}${c.school_grade ? ", " + esc(c.school_grade) : ""}</td></tr>
        ${c.topics ? `<tr><td>Çalışma konusu</td><td>${esc(c.topics.name)}</td></tr>` : ""}
        ${c.contact_name ? `<tr><td>Veli</td><td>${esc(c.contact_name)}</td></tr>` : ""}
        <tr><td>Rapor dönemi</td><td>${esc(fT.format(donemBas))} – ${esc(fT.format(new Date()))}</td></tr>
      </table>
      <div class="kutular">
        <div><span>Görüşme</span><strong>${G.length}</strong></div>
        <div><span>İlk / son puan</span><strong>${puan.length ? puan[0].v + " → " + puan[puan.length - 1].v : "–"}</strong></div>
        <div><span>Verilen ödev</span><strong>${O.length}</strong></div>
        <div><span>Ödev tamamlama</span><strong>${oran === null ? "–" : "%" + oran}</strong></div>
      </div>
      ${c.goals ? `<h2>Çalışma hedefleri</h2><p style="white-space:pre-wrap">${esc(c.goals)}</p>` : ""}
      <h2>İlerleme</h2>
      <p style="color:#6b7064;margin-top:0">Her görüşmede uzman tarafından verilen değerlendirme puanı (1 = başlangıç, 10 = hedefe ulaşıldı).</p>
      <div class="grafik">${cizgiGrafik(puan)}</div>
      ${takipHtml ? `<h2>Günlük takip</h2>${takipHtml}` : ""}
      ${O.length ? `<h2>Ödevler ve sorumluluklar</h2><ul class="odev">${O.map((t) => `<li>${esc(t.title)} <span style="color:#6b7064">(${KIME[t.assigned_to]})</span><span class="etiket ${t.status}">${ODEV[t.status]}</span>${t.feedback ? `<br><span style="color:#6b7064;font-size:.9rem">“${esc(t.feedback)}”</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${ozetler.length ? `<h2>Görüşme özetleri</h2>${ozetler.map((s, i) => `<div class="ozet"><b>${esc(fT.format(new Date(s.session_date)))}</b>${s.progress ? ` <span class="etiket">${s.progress}/10</span>` : ""}
          ${s.shared_summary ? `<p>${esc(s.shared_summary)}</p>` : ""}
          ${notlar && s.summary ? `<p class="gizli-not"><b>Görüşülenler:</b> ${esc(s.summary)}</p>` : ""}
          ${notlar && s.observations ? `<p class="gizli-not"><b>Gözlemler:</b> ${esc(s.observations)}</p>` : ""}</div>`).join("")}` : ""}
      ${deg ? `<h2>Uzman değerlendirmesi</h2><div class="degerlendirme">${esc(deg)}</div>` : ""}
      <div class="imza"><div style="color:#6b7064;font-size:.85rem">${notlar ? "Bu rapor kurum içi kullanım içindir, gizli görüşme notları içerir." : "Bu rapor danışan/veli ile paylaşılmak üzere hazırlanmıştır."}</div>
        <div class="cizgi">Uzm. ${esc(C.UZMAN)}</div></div>
      <div class="alt">Zambak Danışmanlık · ${esc(C.ADRES)} · ${esc(C.TELEFON)}<br>Bu belge kişisel ve sağlık verisi içerir; yetkisiz kişilerle paylaşılmamalıdır.</div>`;
    document.title = `Gelişim Raporu - ${c.full_name}`;
  }

  async function yukle() {
    if (!id) { $("#sayfa").innerHTML = '<div class="yukleniyor">Danışan seçilmedi.</div>'; return; }
    const { data: ses } = await sb.auth.getSession();
    if (!ses.session) { $("#sayfa").innerHTML = '<div class="yukleniyor">Rapor için önce <a href="/yonetim">yönetim paneline</a> giriş yapın.</div>'; return; }
    const [c, g, o, m, k] = await Promise.all([
      sb.from("clients").select("*, topics(name)").eq("id", id).single(),
      sb.from("sessions").select("*").eq("client_id", id).order("session_date"),
      sb.from("tasks").select("*").eq("client_id", id).order("created_at"),
      sb.from("tracking_metrics").select("*").eq("client_id", id).order("created_at"),
      sb.from("tracking_entries").select("metric_id,entry_date,value").eq("client_id", id).order("entry_date"),
    ]);
    if (c.error || !c.data) { $("#sayfa").innerHTML = '<div class="yukleniyor">Danışan bulunamadı ya da yetkiniz yok.</div>'; return; }
    veri = { c: c.data, gorusmeler: g.data || [], odevler: o.data || [], olcutler: m.data || [], kayitlar: k.data || [] };
    ciz();
  }
  ["#donem", "#notlar"].forEach((s) => $(s).addEventListener("change", () => veri && ciz()));
  $("#degerlendirme").addEventListener("input", () => veri && ciz());
  $("#yazdir").addEventListener("click", () => window.print());
  yukle();
})();
