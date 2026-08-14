// Llamadas a la base de datos. Todo va por funciones RPC de PostgREST:
// POST /rest/v1/rpc/<funcion> con los argumentos en el cuerpo.

const API = (function () {
  // Vale tanto "https://xxx.supabase.co" como "https://xxx.supabase.co/rest/v1/"
  const base = () => (window.CONFIG?.SUPABASE_URL || "")
    .trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key  = () => (window.CONFIG?.SUPABASE_ANON_KEY || "").trim();

  const configurado = () => Boolean(base() && key());

  async function rpc(fn, args = {}) {
    if (!configurado()) {
      throw new Error("Falta configurar app/config.js con la URL y la clave de Supabase.");
    }
    let r;
    try {
      r = await fetch(`${base()}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key(),
          Authorization: `Bearer ${key()}`
        },
        body: JSON.stringify(args)
      });
    } catch {
      throw new Error("Sin conexión con el servidor. Revisa tu conexión a internet.");
    }

    if (!r.ok) {
      let msg = `Error del servidor (${r.status})`;
      try {
        const j = await r.json();
        msg = j.message || j.hint || j.details || msg;
      } catch { /* respuesta sin json */ }
      throw new Error(msg);
    }
    return r.json();
  }

  return { rpc, configurado };
})();
