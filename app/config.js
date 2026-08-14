// Rellena estos dos valores con los de tu proyecto de Supabase:
//   Project Settings -> API -> Project URL  y  Project API keys -> anon public
//
// La clave "anon" es publica por diseno y va dentro de la web. La seguridad no
// depende de ella: las tablas estan cerradas y solo se puede operar a traves de
// las funciones de sql/02_api.sql, que validan el PIN y la hora de cierre.

window.CONFIG = {
  SUPABASE_URL: "https://mcjtduyluwajemmvhren.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1janRkdXlsdXdhamVtbXZocmVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTMxNjgsImV4cCI6MjEwMjI4OTE2OH0.vF7R4_Zrz3IYNFxh5DoHzQbr1I2ibiEK2O72CFkVgFQ"
};
