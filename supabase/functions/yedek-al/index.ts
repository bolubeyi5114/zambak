// Zambak — gece yedeği. Çıktı, yedek şifresiyle AES-256-GCM ile şifrelenir.
// Biçim: "ZBK1" | tuz(16) | iv(12) | şifreli( uzunluk(4) | başlık JSON | içerik )
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "danisan-dosyalari";
const enc = new TextEncoder();

async function ayar(key: string) {
  const { data } = await db.from("app_config").select("value").eq("key", key).single();
  return data?.value as string;
}

async function sifrele(sifre: string, baslik: unknown, icerik: Uint8Array) {
  const tuz = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ham = await crypto.subtle.importKey("raw", enc.encode(sifre), "PBKDF2", false, ["deriveKey"]);
  const anahtar = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: tuz, iterations: 200000, hash: "SHA-256" },
    ham, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const b = enc.encode(JSON.stringify(baslik));
  const duz = new Uint8Array(4 + b.length + icerik.length);
  new DataView(duz.buffer).setUint32(0, b.length);
  duz.set(b, 4); duz.set(icerik, 4 + b.length);
  const sif = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, anahtar, duz));
  const out = new Uint8Array(4 + 16 + 12 + sif.length);
  out.set(enc.encode("ZBK1"), 0); out.set(tuz, 4); out.set(iv, 20); out.set(sif, 32);
  return out;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const tur = url.searchParams.get("tur") ?? "veri";
    const sifre = await ayar("yedek_sifre");
    const { data: liste } = await db.rpc("yedek_dosyalar");
    const dosyaSayisi = (liste ?? []).length;
    const h = { "Content-Type": "application/octet-stream", "X-Dosya-Sayisi": String(dosyaSayisi) };

    if (tur === "veri") {
      const son = Date.parse(await ayar("yedek_son") ?? "1970-01-01");
      if (Date.now() - son < 60_000) return new Response("Çok sık istek", { status: 429 });
      await db.from("app_config").update({ value: new Date().toISOString() }).eq("key", "yedek_son");
      const { data, error } = await db.rpc("yedek_json");
      if (error) throw error;
      const tarih = new Date().toISOString().slice(0, 10);
      const out = await sifrele(sifre, { tur: "veri", ad: `zambak-veri-${tarih}.json` },
        enc.encode(JSON.stringify(data)));
      return new Response(out, { headers: h });
    }

    if (tur === "dosya") {
      const no = Number(url.searchParams.get("no"));
      const kayit = (liste ?? []).find((x: { no: number }) => x.no === no);
      if (!kayit) return new Response("Yok", { status: 404 });
      const { data, error } = await db.storage.from(BUCKET).download(kayit.ad);
      if (error) throw error;
      const out = await sifrele(sifre, { tur: "dosya", ad: kayit.ad, tip: data.type },
        new Uint8Array(await data.arrayBuffer()));
      return new Response(out, { headers: h });
    }
    return new Response("Geçersiz", { status: 400 });
  } catch (e) {
    console.error(e);
    return new Response("Hata", { status: 500 });
  }
});
