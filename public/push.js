// Ortak bildirim yardımcıları (panel ve danışan ekranı)
window.ZambakPush = (function () {
  const destek = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const yuklu = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let kayit = null;

  async function swKaydet() {
    if (!("serviceWorker" in navigator)) return null;
    if (!kayit) kayit = await navigator.serviceWorker.register("/sw.js");
    return kayit;
  }
  function b64(s) {
    const p = "=".repeat((4 - (s.length % 4)) % 4);
    const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...r].map((c) => c.charCodeAt(0)));
  }
  async function durum(sb) {
    if (!destek) return ios && !yuklu ? "ios-yukle" : "desteklenmiyor";
    if (Notification.permission === "denied") return "engelli";
    const r = await swKaydet();
    const abone = await r.pushManager.getSubscription();
    if (!abone) return "kapali";
    const { data } = await sb.rpc("push_durum", { p_endpoint: abone.endpoint });
    return data ? "acik" : "kapali";
  }
  async function ac(sb) {
    if (!destek) throw new Error(ios && !yuklu ? "iPhone'da bildirim için önce uygulamayı ana ekrana ekleyip oradan açın." : "Bu tarayıcı bildirimleri desteklemiyor.");
    const izin = await Notification.requestPermission();
    if (izin !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.");
    const r = await swKaydet();
    const { data: anahtar, error } = await sb.rpc("vapid_anahtar");
    if (error || !anahtar) throw new Error("Bildirim ayarı alınamadı.");
    let abone = await r.pushManager.getSubscription();
    if (!abone) abone = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(anahtar) });
    const j = abone.toJSON();
    const s = await sb.rpc("push_abone_ol", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (s.error) throw new Error(s.error.message || "Bildirim açılamadı.");
  }
  async function kapat(sb) {
    const r = await swKaydet();
    const abone = r && (await r.pushManager.getSubscription());
    if (abone) { await sb.rpc("push_abonelik_sil", { p_endpoint: abone.endpoint }); await abone.unsubscribe(); }
  }
  const METIN = {
    acik: "Bildirimler bu cihazda açık.",
    kapali: "Bildirimler kapalı.",
    engelli: "Bildirimlere izin verilmemiş. Telefonun ayarlarından bu site için bildirime izin verin.",
    desteklenmiyor: "Bu tarayıcı bildirimleri desteklemiyor. Chrome ile açmayı deneyin.",
    "ios-yukle": "iPhone'da bildirim için önce paylaş menüsünden “Ana Ekrana Ekle” deyin ve uygulamayı ana ekrandan açın.",
  };
  // Bildirime dokununca açık sayfaya yönlendirme
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.tip === "git") { const u = new URL(e.data.url); if (u.hash) { location.hash = u.hash; window.dispatchEvent(new HashChangeEvent("hashchange")); } }
    });
    swKaydet().catch(() => {});
  }
  return { durum, ac, kapat, METIN };
})();
