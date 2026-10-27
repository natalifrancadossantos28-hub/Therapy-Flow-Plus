// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) só com node:crypto, sem dependências.
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const de64u = (s) => Buffer.from(s, "base64url");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

function vapidJwt(audience, { publicKey, privateKey, subject }) {
  const pub = de64u(publicKey);
  const key = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

export function cifrar(texto, p256dh, auth) {
  const uaPub = de64u(p256dh);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const segredo = ecdh.computeSecret(uaPub);
  const salt = crypto.randomBytes(16);
  const ikm = hmac(hmac(de64u(auth), segredo), Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const corpo = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, corpo]);
}

/** Envia um aviso. sub = { endpoint, p256dh, auth }; devolve { status, texto }. */
export async function enviarPush(sub, payload, vapid) {
  const jwt = vapidJwt(new URL(sub.endpoint).origin, vapid);
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "43200",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body: cifrar(JSON.stringify(payload), sub.p256dh, sub.auth),
  });
  return { status: r.status, texto: r.ok ? "" : (await r.text()).slice(0, 200) };
}
