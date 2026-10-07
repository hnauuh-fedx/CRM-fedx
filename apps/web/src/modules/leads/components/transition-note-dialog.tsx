import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/modules/auth/auth-context";
import { changeLeadStage, changeLeadStatus, getTransitionNoteOptions } from "@/services/lead.service";
import type { LeadDetail } from "../lead.types";
import type { TransitionNoteOptions } from "../transition-note.types";

type NoteSelection = { templateId?: string; noteContent?: string };

export function useTransitionNotePrompt<Command>(onConfirm: (command: Command, selection: NoteSelection) => Promise<void> | void) {
  const auth = useAuth();
  const inFlight = useRef(false);
  const [prompt, setPrompt] = useState<{ command: Command; options: TransitionNoteOptions } | null>(null);
  const confirmation = useMutation({
    mutationFn: async ({ command, selection }: { command: Command; selection: NoteSelection }) => { await onConfirm(command, selection); },
    onSuccess: () => setPrompt(null),
  });
  const preparation = useMutation({
    mutationFn: async ({ leadId, target, command }: { leadId: string; target: string; command: Command }) => {
      const options = await getTransitionNoteOptions(leadId, target, auth.accessToken!);
      if (options.templates.length > 0) setPrompt({ command, options });
      else await confirmation.mutateAsync({ command, selection: {} });
    },
    onSettled: () => { inFlight.current = false; },
  });
  return {
    request: (leadId: string, target: string, command: Command) => {
      if (inFlight.current || prompt || confirmation.isPending) return;
      inFlight.current = true;
      confirmation.reset();
      preparation.mutate({ leadId, target, command });
    },
    isPending: preparation.isPending || confirmation.isPending,
    error: preparation.error ?? confirmation.error,
    dialog: prompt && <TransitionNoteDialog
      options={prompt.options}
      isPending={confirmation.isPending}
      error={confirmation.error}
      onCancel={() => { if (!confirmation.isPending) { setPrompt(null); confirmation.reset(); } }}
      onConfirm={(selection) => confirmation.mutate({ command: prompt.command, selection })}
    />,
  };
}

function TransitionNoteDialog({ options, isPending, error, onCancel, onConfirm }: {
  options: TransitionNoteOptions;
  isPending: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: (selection: NoteSelection) => void;
}) {
  const [selectedId, setSelectedId] = useState("__skip__");
  const [noteContent, setNoteContent] = useState("");
  const selected = options.templates.find((item) => item.id === selectedId);
  return <Dialog open onOpenChange={(open) => !open && onCancel()}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!isPending}>
      <DialogHeader>
        <DialogTitle>Ghi chú chuyển trạng thái</DialogTitle>
        <DialogDescription>Chuyển sang {options.label}. Bạn có thể chọn một ghi chú có sẵn hoặc bỏ qua.</DialogDescription>
      </DialogHeader>
      <Field data-disabled={isPending}>
        <FieldLabel htmlFor="transition-note-selection">Ghi chú (không bắt buộc)</FieldLabel>
        <Select value={selectedId} onValueChange={(id) => {
          setSelectedId(id);
          setNoteContent(options.templates.find((item) => item.id === id)?.content ?? "");
        }} disabled={isPending}>
          <SelectTrigger id="transition-note-selection" className="h-auto min-h-11 w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            <SelectItem value="__skip__">Không chọn ghi chú</SelectItem>
            {options.templates.map((item) => <SelectItem key={item.id} value={item.id} className="whitespace-normal break-words">{item.content}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
        <FieldDescription>Chỉ các ghi chú đã cấu hình cho {options.label} được hiển thị.</FieldDescription>
      </Field>
      {selected && <Field>
        <FieldLabel htmlFor="transition-note-content">Nội dung ghi chú</FieldLabel>
        <Textarea id="transition-note-content" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} rows={4} maxLength={1800} disabled={isPending} aria-describedby="transition-note-content-help" />
        <FieldDescription id="transition-note-content-help">Có thể chỉnh sửa hoặc bổ sung chi tiết. Mẫu ghi chú đã cấu hình không thay đổi.</FieldDescription>
        {!noteContent.trim() && <p role="alert" className="text-sm text-destructive">Nhập nội dung ghi chú hoặc chọn không ghi chú để bỏ qua.</p>}
      </Field>}
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>Hủy</Button>
        <Button type="button" disabled={isPending || Boolean(selected && !noteContent.trim())} onClick={() => onConfirm({ templateId: selected?.id, noteContent: selected ? noteContent.trim() : undefined })}>{isPending ? "Đang lưu…" : selected ? "Xác nhận" : "Chuyển không ghi chú"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

type TransitionCommand = { kind: "stage"; leadId: string; stageId: string } | { kind: "status"; leadId: string; status: "ACTIVE" | "FAIL" };

export function useLeadWorkflowTransition(lead?: LeadDetail) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const prompt = useTransitionNotePrompt<TransitionCommand>(async (command, selection) => {
    if (command.kind === "stage") await changeLeadStage(command.leadId, command.stageId, auth.accessToken!, selection.templateId, selection.noteContent);
    else await changeLeadStatus(command.leadId, command.status, auth.accessToken!, selection.templateId, selection.noteContent);
    await Promise.all(["leads", "sale", "dashboard", "reports"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  });
  return {
    ...prompt,
    changeStage: (stageId: string) => {
      if (lead && stageId !== lead.pipelineStage?.id) prompt.request(lead.id, stageId, { kind: "stage", leadId: lead.id, stageId });
    },
    changeStatus: (status: "ACTIVE" | "FAIL") => {
      if (!lead || status === lead.lifecycleStatus.value) return;
      const target = status === "FAIL" ? "FAIL" : lead.lifecycleStatus.failedStageId;
      if (target) prompt.request(lead.id, target, { kind: "status", leadId: lead.id, status });
    },
  };
}
