import { getScope } from "@/server/services/context";
import { filterSuggestions } from "@/assistant/suggestions";
import { AssistantFullPage } from "@/components/assistant/full-page";

export const metadata = { title: "Assistente" };

export default async function AssistentePage() {
  const scope = await getScope();
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL);
  return <AssistantFullPage suggestions={filterSuggestions([...scope.houseCodes].sort(), scope.canSeeFinance, scope.canRegister)} canRegister={scope.canRegister} aiEnabled={aiEnabled} />;
}
