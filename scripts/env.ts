import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

/**
 * Nos scripts (reset, avanço diário, avaliação), os serviços do app usam a MESMA conexão de sessão (DIRECT_URL)
 * em vez do Transaction pooler: evita misturar duas conexões no mesmo processo (no Supabase, a etapa de
 * relatórios do reset travava esperando a outra conexão). O app na Vercel continua usando DATABASE_URL.
 */
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL_APP = process.env.DATABASE_URL ?? "";
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
