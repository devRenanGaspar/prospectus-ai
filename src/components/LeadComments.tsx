import { useState } from "react";
import { MessageSquare, Plus, User, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import LoadingState from "@/components/LoadingState";
import { useLeadComments, useAddLeadComment } from "@/hooks/useLeadComments";
import { z } from "zod";
import { toast } from "sonner";

const commentSchema = z.object({
  authorName: z.string().trim().min(1, "Nome obrigatório").max(200),
  content: z.string().trim().min(1, "Comentário obrigatório").max(5000),
  rating: z.number().min(1).max(5).optional(),
});

interface LeadCommentsProps {
  leadId: string;
}

const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => onChange(value === star ? 0 : star)}
        className="p-0.5 hover:scale-110 transition-transform"
      >
        <Star
          className={`h-4 w-4 ${star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
        />
      </button>
    ))}
  </div>
);

const DisplayStars = ({ rating }: { rating: number | null }) => {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3 w-3 ${star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
};

const LeadComments = ({ leadId }: LeadCommentsProps) => {
  const { data: comments = [], isLoading } = useLeadComments(leadId);
  const addComment = useAddLeadComment();
  const [showForm, setShowForm] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState(0);

  const handleSubmit = () => {
    const result = commentSchema.safeParse({
      authorName,
      content,
      ...(rating > 0 ? { rating } : {}),
    });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    addComment.mutate(
      {
        leadId,
        authorName: result.data.authorName,
        content: result.data.content,
        ...(result.data.rating ? { rating: result.data.rating } : {}),
      },
      {
        onSuccess: () => {
          setAuthorName("");
          setContent("");
          setRating(0);
          setShowForm(false);
        },
      }
    );
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Comentários
            <Badge variant="secondary" className="text-xs">{comments.length}</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border/50">
            <Input
              placeholder="Nome do autor"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="text-sm"
            />
            <Textarea
              placeholder="Escreva o comentário..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] text-sm"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Avaliação:</span>
                <StarRating value={rating} onChange={setRating} />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={addComment.isPending}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingState variant="inline" count={2} />
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 italic">Nenhum comentário ainda.</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto pr-1">
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-medium">
                      <User className="h-3 w-3" /> {c.author_name}
                    </span>
                    <div className="flex items-center gap-2">
                      <DisplayStars rating={c.rating} />
                      {c.commented_at && <span>{c.commented_at}</span>}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LeadComments;
