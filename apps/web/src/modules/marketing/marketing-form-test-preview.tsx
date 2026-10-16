import { useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MarketingFormFill } from "./marketing-form-fill";
import type { MarketingFormInput, PublicMarketingFormConfig } from "./marketing-reference.types";

export function MarketingFormTestPreview({ input, onClose }: { input: MarketingFormInput; onClose: () => void }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const form: PublicMarketingFormConfig = {
    id: "preview", name: input.name, formType: input.formType, title: input.title || input.name,
    subtitle: input.subtitle, description: input.description, submitButtonLabel: input.submitButtonLabel,
    primaryColor: input.primaryColor, backgroundColor: input.backgroundColor, displaySettings: input.displaySettings,
    platform: input.platform, campaign: null,
    fields: input.fields.filter(field => field.isActive !== false).map(field => ({ ...field, placeholder: field.placeholder ?? null })),
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Điền thử biểu mẫu</DialogTitle><DialogDescription>Dùng cấu hình hiện tại, kể cả thay đổi chưa lưu. Không tạo Lead, lưu phản hồi, gửi thông báo hoặc chạy automation.</DialogDescription></DialogHeader><MarketingFormFill mode="preview" form={form} /></DialogContent></Dialog>;
}
