import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PreferenceSection } from "@admission-crm/shared/system-preferences";
import { useAuth } from "@/modules/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSystemPreferenceHistory } from "@/services/system-preferences.service";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
export function SystemPreferenceHistory({ programId, section, disabled, onRestore }: { programId: string; section: PreferenceSection; disabled: boolean; onRestore: (value: unknown) => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["system-preference-history", programId, section, page], queryFn: () => getSystemPreferenceHistory(auth.accessToken!, programId, section, page), enabled: open && auth.can("audit.view"), staleTime: 0 });
  if (!auth.can("audit.view")) return null;
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setPage(1); }}><DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled}>Lịch sử</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Lịch sử thay đổi cấu hình</DialogTitle><DialogDescription>Chọn phiên bản trước để điền lại biểu mẫu. Kiểm tra rồi bấm “Lưu thay đổi” để khôi phục.</DialogDescription></DialogHeader>
    {query.isPending ? <p role="status">Đang tải lịch sử…</p> : query.isError ? <p role="alert">{query.error.message}</p> : <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">{query.data.data.length ? query.data.data.map(entry => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div className="text-sm"><p>{entry.actor}</p><p className="text-muted-foreground">{entry.createdAt ? dateFormatter.format(new Date(entry.createdAt)) : "Không rõ thời gian"}</p></div><Button type="button" variant="outline" disabled={!entry.previousValue} onClick={() => { onRestore(entry.previousValue); setOpen(false); }}>Dùng giá trị trước lần sửa này</Button></div>) : <p>Chưa có lịch sử thay đổi.</p>}</div>}
    <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(page - 1)}>Trang trước</Button><span className="text-sm">Trang {page}</span><Button type="button" variant="outline" disabled={!query.data?.hasMore || query.isFetching} onClick={() => setPage(page + 1)}>Trang sau</Button></div>
  </DialogContent></Dialog>;
}
