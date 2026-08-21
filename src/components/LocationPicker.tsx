import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import brLocations from "@/data/br-locations.json";

// Brazil only, for both uses of this component (agency profile and lead
// search location) -- decided after checking production: zero accounts had
// ever selected a country other than BR out of the 4 the previous
// country-state-city-backed picker supported. If cross-border prospecting
// ever matters, that is a deliberate new feature, not a capability inherited
// from a generic geo library.
//
// Data source: IBGE's public localidades API (servicodados.ibge.gov.br),
// government open data -- not the country-state-city package, which is
// GPL-3.0 and was shipping an 8.6 MB chunk for four countries' worth of data
// this product never used three quarters of. This dataset is Brazil only,
// ~83 KB.
const ESTADOS = brLocations.estados as { sigla: string; nome: string }[];
const MUNICIPIOS_POR_ESTADO = brLocations.municipiosPorEstado as Record<string, string[]>;

interface LocationPickerProps {
  estado?: string;
  cidade?: string;
  onChange: (value: { estado: string; cidade: string }) => void;
}

export default function LocationPicker({
  estado = "",
  cidade = "",
  onChange,
}: LocationPickerProps) {
  const [cityOpen, setCityOpen] = useState(false);

  const cities = useMemo(() => {
    if (!estado) return [];
    return MUNICIPIOS_POR_ESTADO[estado] ?? [];
  }, [estado]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Estado */}
      <div className="space-y-2">
        <Label>Estado</Label>
        <div className="flex gap-2">
          <Select
            key={estado || "empty-estado"}
            value={estado || undefined}
            onValueChange={(v) => onChange({ estado: v, cidade: "" })}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((s) => (
                <SelectItem key={s.sigla} value={s.sigla}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {estado && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Limpar seleção"
              onClick={() => onChange({ estado: "", cidade: "" })}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Cidade — Combobox com busca */}
      <div className="space-y-2">
        <Label>Cidade</Label>
        <div className="flex gap-2">
          <Popover open={cityOpen} onOpenChange={setCityOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={cityOpen}
                disabled={!estado}
                className={cn(
                  "flex-1 justify-between font-normal",
                  !cidade && "text-muted-foreground",
                )}
              >
                {cidade || (estado ? "Selecione a cidade" : "Selecione um estado antes")}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar cidade..." />
              <CommandList>
                <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
                <CommandGroup>
                  {cities.map((c) => (
                    <CommandItem
                      key={c}
                      value={c}
                      onSelect={(value) => {
                        onChange({ estado, cidade: value });
                        setCityOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          cidade === c ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {c}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
          </Popover>
          {cidade && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Limpar seleção"
              onClick={() => onChange({ estado, cidade: "" })}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Concatenates into the legacy `localizacao` string. E.g. "São Paulo, SP" */
export function buildLocalizacaoString(estado?: string, cidade?: string): string {
  const parts = [cidade, estado].filter((p) => p && p.trim().length > 0);
  return parts.join(", ");
}
