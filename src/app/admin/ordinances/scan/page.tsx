"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  DocumentScannerFlow,
  defaultBuildPdf,
} from "@/components/admin/document-scanner/document-scanner-flow";
import { ScanDocumentInfoDialog } from "@/components/admin/document-scanner/scan-document-info-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { createOrdinanceAction } from "@/lib/ordinance-actions";
import {
  APPROPRIATION_ORDINANCE_CATEGORY,
  getSeriesYearOptions,
} from "@/lib/constants";
import { OrdinanceKindField } from "@/components/admin/ordinance-kind-field";

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

export default function OrdinanceScanPage() {
  const { categories } = useActiveCategories();

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

  async function handleUpload(pdfFile: File) {
    const valid = await form.trigger();
    if (!valid) {
      toast.error("Please complete all required document information");
      return false;
    }

    const values = form.getValues();
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
    formData.append("pdf", pdfFile);

    const result = await createOrdinanceAction(formData);
    if (result.success) {
      toast.success("Scanned ordinance uploaded successfully");
      return true;
    }

    toast.error(result.error);
    return false;
  }

  return (
    <DocumentScannerFlow
      backHref="/admin/ordinances"
      pdfFileName="scanned-ordinance.pdf"
      onBuildPdf={(pages) => defaultBuildPdf(pages, "scanned-ordinance.pdf")}
      onUpload={handleUpload}
      infoDialog={({ open, onOpenChange, pdfFile, submitting, onSubmit }) => (
        <ScanDocumentInfoDialog
          open={open}
          onOpenChange={onOpenChange}
          title="Ordinance information"
          description="Review the scanned PDF and fill in the document details before uploading."
          pdfFile={pdfFile}
          submitting={submitting}
          onSubmit={onSubmit}
        >
          <Form {...form}>
            <form className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="ordinanceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        No. <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 01" {...field} />
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {yearOptions.map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
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
                        className="min-h-[80px] resize-none"
                        placeholder="Enter the full title of the ordinance"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
            </form>
          </Form>
        </ScanDocumentInfoDialog>
      )}
    />
  );
}
