import type { Scope } from "@/server/permissions";
import { getForecast } from "@/server/services/finance";
import { ForecastView } from "@/components/production/forecast-view";

export async function HouseForecast({ scope, house }: { scope: Scope; house: string }) {
  return <ForecastView f={await getForecast(scope, 8)} house={house} />;
}
