import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { getFileCapabilities, getPrivateFileDownload, uploadPrivateFile } from "@/services/private-file.service";

export function PrivateFileUpload({ leadId, token, documentType, onUploaded }: { leadId: string; token: string; documentType?: string; onUploaded: () => void }) {
  const capabilities = useQuery({ queryKey: ["file-capabilities"], queryFn: () => getFileCapabilities(token), staleTime: 60000 });
  const [selected, setSelected] = useState<{ file: File; requestId: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const mutation = useMutation({ mutationFn: async () => {
    if (!selected) throw new Error("Vui lòng chọn tệp.");
    if (selected.file.size > (capabilities.data?.maxBytes ?? 0)) throw new Error("Tệp vượt dung lượng cho phép.");
    return uploadPrivateFile(leadId, selected.file, selected.requestId, token, documentType);
  }, onSuccess: () => { setSelected(null); setRevision(value => value + 1); onUploaded(); } });
  if (!capabilities.data?.uploadEnabled) return null;
  return <FieldGroup className="gap-3 rounded-lg border p-3">
    <Field><FieldLabel htmlFor={`private-upload-${documentType ? "admission" : "lead"}`}>Chọn tệp trên máy</FieldLabel><Input ref={fileInput} key={revision} id={`private-upload-${documentType ? "admission" : "lead"}`} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" disabled={mutation.isPending} onChange={event => { mutation.reset(); const file = event.target.files?.[0]; setSelected(file ? { file, requestId: crypto.randomUUID() } : null); }} /><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => fileInput.current?.click()}>Chọn tệp</Button><p className="break-all text-sm">{selected?.file.name ?? "Chưa chọn tệp"}</p><p className="text-sm text-muted-foreground">PDF, JPEG hoặc PNG; tối đa {capabilities.data.maxBytes < 1048576 ? `${Math.ceil(capabilities.data.maxBytes / 1024)} KB` : `${Math.round(capabilities.data.maxBytes / 1048576)} MB`}.</p></Field>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    <Button type="button" disabled={!selected || !leadId || documentType === "" || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Đang tải tệp…" : mutation.isError ? "Thử lại tải tệp" : "Tải tệp lên"}</Button>
  </FieldGroup>;
}

export function PrivateFileDownload({ id, name, token }: { id: string; name: string; token: string }) {
  const download = useMutation({ mutationFn: () => getPrivateFileDownload(id, token), onSuccess: result => { window.location.assign(result.url); } });
  return <span className="flex flex-col gap-1"><Button type="button" size="sm" variant="outline" aria-label={`Tải tệp ${name}`} disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? "Đang chuẩn bị…" : "Tải tệp"}</Button>{download.isError && <span role="alert" className="text-sm text-destructive">{download.error.message}</span>}</span>;
}
