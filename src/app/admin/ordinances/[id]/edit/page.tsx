"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { useActiveCategories } from "@/hooks/use-active-categories";
import {
  fetchOrdinanceByIdAction,
  updateOrdinanceAction,
} from "@/lib/ordinance-actions";
import {
  APPROPRIATION_ORDINANCE_CATEGORY,
  getSeriesYearOptions,
} from "@/lib/constants";
import { OrdinanceKindField } from "@/components/admin/ordinance-kind-field";
import { EditPdfDocumentField } from "@/components/admin/edit-pdf-document-field";
import { formatOrdinanceNumber } from "@/lib/utils";
import type { LegislativeDocument } from "@/lib/types";

const currentYear = new Date().getFullYear();
const yearOptions = getSeriesYearOptions(currentYear);

const formSchema = z.object({
  ordinanceNumber: z.string().min(1, "Ordinance number is required"),
  seriesYear: z.string().min(1, "Series year is required"),
  title: z.string().min(1, "Title is required"),
  authorSponsor: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  isAppropriationOrdinance: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function getOrdinanceNumberFromDoc(doc: LegislativeDocument): string {
  const fullNumber = doc.approvedNumber || doc.proposedNumber;
  const separatorIndex = fullNumber.indexOf("-");
  if (separatorIndex === -1) return fullNumber;
  return fullNumber.slice(separatorIndex + 1);
}

export default function EditOrdinancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { categories } = useActiveCategories();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<LegislativeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ordinanceNumber: "",
      seriesYear: currentYear.toString(),
      title: "",
      authorSponsor: "",
      category: "",
      isAppropriationOrdinance: false,
    },
  });

  const selectedCategory = form.watch("category");

  useEffect(() => {
    if (selectedCategory !== APPROPRIATION_ORDINANCE_CATEGORY) {
      form.setValue("isAppropriationOrdinance", false);
    }
  }, [selectedCategory, form]);

  useEffect(() => {
    async function load() {
      const result = await fetchOrdinanceByIdAction(id);
      if (result.success) {
        setDoc(result.data);
        form.reset({
          ordinanceNumber: getOrdinanceNumberFromDoc(result.data),
          seriesYear: result.data.seriesYear.toString(),
          title: result.data.title,
          authorSponsor: result.data.authorSponsor,
          category: result.data.category,
          isAppropriationOrdinance:
            result.data.ordinanceKind === "appropriation",
        });
      }
      setLoading(false);
    }
    void load();
  }, [id, form]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading ordinance...</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-semibold">Ordinance not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The ordinance you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/ordinances">Back to Ordinances</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const formData = new FormData();
    formData.append("ordinanceNumber", values.ordinanceNumber);
    formData.append("seriesYear", values.seriesYear);
    formData.append("title", values.title);
    formData.append("authorSponsor", values.authorSponsor ?? "");
    formData.append("category", values.category);
    formData.append(
      "ordinanceKind",
      values.isAppropriationOrdinance ? "appropriation" : "municipal"
    );
    if (pdfFile) {
      formData.append("pdf", pdfFile);
    }

    const result = await updateOrdinanceAction(id, formData);
    setSubmitting(false);

    if (result.success) {
      toast.success("Ordinance updated successfully");
      router.push("/admin/ordinances");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/ordinances">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {formatOrdinanceNumber(doc)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Update the document details below
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="ordinanceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        No. <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 01, 02, 03" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="seriesYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Series <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {yearOptions.map((y) => (
                            <SelectItem key={y} value={y.toString()}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Title <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter the full title of the ordinance"
                        className="min-h-[80px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="authorSponsor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Author / Sponsor</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Hon. Ricardo Mendoza" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Category <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <OrdinanceKindField
                category={selectedCategory}
                checked={form.watch("isAppropriationOrdinance")}
                onCheckedChange={(checked) =>
                  form.setValue("isAppropriationOrdinance", checked)
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">PDF Document</CardTitle>
            </CardHeader>
            <CardContent>
              <EditPdfDocumentField
                existingFileName={`${formatOrdinanceNumber(doc)}.pdf`}
                hasExistingDocument={Boolean(doc.pdfUrl)}
                value={pdfFile}
                onChange={setPdfFile}
              />
            </CardContent>
          </Card>

          <Separator />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" asChild>
              <Link href="/admin/ordinances">Cancel</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
