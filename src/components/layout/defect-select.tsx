"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";

export function ParamSelect({ name, value, options, label }: { name: string; value: string; options: Array<{ key: string; label: string }>; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(e) => {
        const q = new URLSearchParams(sp.toString());
        q.set(name, e.target.value);
        router.push(`${pathname}?${q}`, { scroll: false });
      }}
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
