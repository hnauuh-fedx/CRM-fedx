import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  ["questions", "Câu hỏi"], ["crm", "Dữ liệu CRM"], ["appearance", "Giao diện"],
  ["processing", "Xử lý phản hồi"], ["share", "Chia sẻ"], ["results", "Kết quả"],
] as const;
export function MarketingFormBuilderTabs({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <Tabs value={value} onValueChange={onChange} className="min-w-0">
    <div className="overflow-x-auto px-3 py-2"><TabsList variant="line" aria-label="Cấu hình Form & Survey">{tabs.map(([key, label]) => <TabsTrigger key={key} value={key} className="min-h-11">{label}</TabsTrigger>)}</TabsList></div>
    {children}
  </Tabs>;
}
