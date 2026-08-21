import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { useEffect, useState } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

const SearchInput = ({ value, onChange, placeholder = "Buscar...", className, debounceMs = 300 }: SearchInputProps) => {
  const [local, setLocal] = useState(value);
  const debounced = useDebounce(local, debounceMs);

  useEffect(() => {
    if (debounced !== value) onChange(debounced);
  }, [debounced, onChange, value]);

  // Sync from parent
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="pl-9 bg-secondary/50 border-border/50 focus:bg-background"
        aria-label={placeholder}
      />
    </div>
  );
};

export default SearchInput;
