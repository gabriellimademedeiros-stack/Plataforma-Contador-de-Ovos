/**
 * Normaliza a string de conexão colada do painel do Supabase: tira espaços, quebras de linha e aspas,
 * remove colchetes em volta da senha e codifica caracteres especiais da senha (@, #, /, ?, %, :).
 * Devolve também um diagnóstico em português, sem mostrar a senha.
 */
export interface DbUrlCheck {
  url: string | null;
  problems: string[];
  host: string | null;
  port: string | null;
}

export function normalizeDbUrl(raw: string | undefined | null): DbUrlCheck {
  const problems: string[] = [];
  if (!raw || !raw.trim()) return { url: null, problems: ["está vazia"], host: null, port: null };
  let s = raw.replace(/[\r\n\t]/g, "").trim().replace(/^["']|["']$/g, "").trim();
  if (/\s/.test(s)) {
    problems.push("tinha espaços no meio (foram removidos)");
    s = s.replace(/\s+/g, "");
  }
  if (/YOUR-PASSWORD|SUA-SENHA/i.test(s)) problems.push("ainda tem o texto [YOUR-PASSWORD]: troque pela senha do banco");
  const m = s.match(/^(postgres(?:ql)?):\/\/([^:/?#]+):(.*)@([^@/?#]+)(\/[^?#]*)?(\?.*)?$/);
  if (!m) {
    if (!/^postgres(ql)?:\/\//.test(s)) problems.push("não começa com postgresql://");
    else problems.push("não tem o formato postgresql://usuário:senha@servidor:porta/postgres");
    return { url: null, problems, host: null, port: null };
  }
  const [, scheme, user, passRaw, hostPort, path, query] = m;
  let pass = passRaw;
  if (/^\[.*\]$/.test(pass)) {
    problems.push("a senha estava entre colchetes (foram removidos)");
    pass = pass.slice(1, -1);
  }
  let decoded = pass;
  try {
    decoded = decodeURIComponent(pass);
  } catch {
    decoded = pass;
  }
  const url = `${scheme}://${user}:${encodeURIComponent(decoded)}@${hostPort}${path ?? "/postgres"}${query ?? ""}`;
  const [host, port] = hostPort.split(":");
  return { url, problems, host, port: port ?? null };
}

/** URL pronta para o cliente; lança erro claro (sem a senha) se não der para usar. */
export function dbUrlFrom(name: "DATABASE_URL" | "DIRECT_URL", raw: string | undefined): string {
  const c = normalizeDbUrl(raw);
  if (!c.url) throw new Error(`${name} inválida: ${c.problems.join("; ")}.`);
  return c.url;
}
