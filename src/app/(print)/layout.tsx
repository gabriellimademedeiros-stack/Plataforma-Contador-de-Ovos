import { requireUser } from "@/server/auth/session";

/** Layout de impressão e apresentação: sem menu, sem assistente, fundo neutro. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen bg-slate-200 print:bg-white">{children}</div>;
}
