import type { Scope } from "@/server/permissions";
import { getForecast } from "@/server/services/finance";
import { ForecastView } from "./forecast-view";

/** Previsão de 8 semanas por galpão e total (Parte 12.7). */
export async function FarmForecast({ scope }: { scope: Scope }) {
  return <ForecastView f={await getForecast(scope, 8)} />;
}
