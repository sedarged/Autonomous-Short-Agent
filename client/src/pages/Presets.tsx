import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Bookmark, Copy } from "lucide-react";
import { ContentTypeIcon } from "@/components/ContentTypeIcon";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Preset, ContentType, JobSettings } from "@shared/schema";
import { contentTypes, contentTypeInfo } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const presetFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  description: z.string().max(200).optional(),
  contentType: z.enum(contentTypes),
  defaultTitleTemplate: z.string().max(100).optional(),
});

type PresetFormValues = z.infer<typeof presetFormSchema>;

export default function Presets() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [deletingPreset, setDeletingPreset] = useState<Preset | null>(null);

  const { data: presets, isLoading } = useQuery<Preset[]>({
    queryKey: ["/api/presets"],
  });

  const form = useForm<PresetFormValues>({
    resolver: zodResolver(presetFormSchema),
    defaultValues: {
      name: "",
      description: "",
      contentType: "reddit_story",
      defaultTitleTemplate: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PresetFormValues) => {
      return apiRequest("POST", "/api/presets", {
        ...data,
        settings: {
          contentType: data.contentType,
          contentConfig: {},
          visual: { generatorType: "image_sequence", scenesPerMinute: 6 },
          audio: { voiceModel: "alloy", language: "en", musicMode: "none" },
          subtitles: { enabled: true, style: "clean", position: "bottom" },
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset created successfully" });
      setIsCreateOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to create preset",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PresetFormValues }) => {
      return apiRequest("PUT", `/api/presets/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset updated successfully" });
      setEditingPreset(null);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to update preset",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/presets/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset deleted" });
      setDeletingPreset(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete preset",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: async (preset: Preset) => {
      return apiRequest("POST", "/api/presets", {
        name: `${preset.name} (Copy)`,
        description: preset.description,
        contentType: preset.contentType,
        settings: preset.settings,
        defaultTitleTemplate: preset.defaultTitleTemplate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset duplicated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to duplicate preset",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const openEditDialog = (preset: Preset) => {
    setEditingPreset(preset);
    form.reset({
      name: preset.name,
      description: preset.description || "",
      contentType: preset.contentType as ContentType,
      defaultTitleTemplate: preset.defaultTitleTemplate || "",
    });
  };

  const handleSubmit = (data: PresetFormValues) => {
    if (editingPreset) {
      updateMutation.mutate({ id: editingPreset.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Group presets by content type
  const presetsByType = presets?.reduce((acc, preset) => {
    const type = preset.contentType as ContentType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(preset);
    return acc;
  }, {} as Record<ContentType, Preset[]>) || {};

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto" data-testid="presets-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Presets</h1>
          <p className="text-muted-foreground mt-1">
            Save and reuse your favorite video configurations
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-preset">
          <Plus className="w-4 h-4 mr-2" />
          New Preset
        </Button>
      </div>

      {/* Presets List */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : presets && presets.length > 0 ? (
        <div className="space-y-8">
          {(Object.entries(presetsByType) as [ContentType, Preset[]][]).map(([type, typePresets]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-4">
                <ContentTypeIcon contentType={type as ContentType} className="w-5 h-5" />
                <h2 className="text-lg font-semibold">{contentTypeInfo[type as ContentType].label}</h2>
                <Badge variant="secondary" className="ml-2">{typePresets.length}</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {typePresets.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onEdit={() => openEditDialog(preset)}
                    onDelete={() => setDeletingPreset(preset)}
                    onDuplicate={() => duplicateMutation.mutate(preset)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState onCreateClick={() => setIsCreateOpen(true)} />
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen || !!editingPreset} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingPreset(null);
          form.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPreset ? "Edit Preset" : "Create New Preset"}</DialogTitle>
            <DialogDescription>
              {editingPreset 
                ? "Update your preset configuration"
                : "Create a reusable configuration for video generation"}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Preset" {...field} data-testid="input-preset-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe this preset..." 
                        {...field} 
                        data-testid="input-preset-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-preset-content-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            <div className="flex items-center gap-2">
                              <ContentTypeIcon contentType={type} className="w-4 h-4" />
                              <span>{contentTypeInfo[type].label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultTitleTemplate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Title Template (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Reddit Story #{{number}}" 
                        {...field} 
                        data-testid="input-preset-title-template"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingPreset(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-preset"
                >
                  {editingPreset ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingPreset} onOpenChange={(open) => !open && setDeletingPreset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingPreset?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPreset && deleteMutation.mutate(deletingPreset.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface PresetCardProps {
  preset: Preset;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function PresetCard({ preset, onEdit, onDelete, onDuplicate }: PresetCardProps) {
  const settings = preset.settings as JobSettings;

  return (
    <Card className="group" data-testid={`preset-card-${preset.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{preset.name}</CardTitle>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} data-testid="button-duplicate-preset">
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} data-testid="button-edit-preset">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete} data-testid="button-delete-preset">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {preset.description && (
          <CardDescription className="line-clamp-2">{preset.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="outline" className="text-[10px]">
            {settings?.audio?.voiceModel || 'alloy'}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {settings?.visual?.scenesPerMinute || 6}/min
          </Badge>
          {settings?.subtitles?.enabled && (
            <Badge variant="outline" className="text-[10px]">
              subtitles
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Updated {formatDistanceToNow(new Date(preset.updatedAt), { addSuffix: true })}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Bookmark className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No presets yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        Create presets to save your favorite video configurations and reuse them quickly.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="w-4 h-4 mr-2" />
        Create First Preset
      </Button>
    </div>
  );
}
