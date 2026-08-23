import { useAdminLeadPool } from "@/hooks/useAdmin";
import PageHeader from "@/components/PageHeader";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import SEO from "@/components/SEO";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

const AdminLeadPool = () => {
  const { data, isLoading, error } = useAdminLeadPool();

  const total = data?.reduce((sum, item) => sum + item.count, 0) ?? 0;

  return (
    <>
      <SEO title="Lead Pool | Admin" />
      <div className="p-6 lg:p-8 space-y-6">
        <PageHeader
          title="Lead Pool"
          description={`Leads sem dono agrupados por nicho — ${total} leads no total`}
        />

        {isLoading && <LoadingState variant="page" count={4} />}
        {error && <ErrorState description="Erro ao carregar lead pool." />}

        {data && (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Nicho</TableHead>
                  <TableHead className="text-right w-32">Leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nenhum lead sem dono encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow key={item.category}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        {item.category}
                      </TableCell>
                      <TableCell>
                        {item.niche_name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{item.count}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminLeadPool;
