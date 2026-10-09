import { Bot, ChevronRight, MessageCircle, MessagesSquare } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const channels = [
  {
    title: "Zalo Official Account",
    description: "Kết nối OA, nhận tin nhắn và nhận diện thông tin ứng viên để tạo lead.",
    href: "/marketing/kenh-ket-noi/zalo",
    icon: MessageCircle,
    status: "Đang hoạt động",
  },
  {
    title: "Meta",
    description: "Nhận tin nhắn từ Facebook Page qua Messenger webhook và theo dõi xử lý.",
    href: "/marketing/kenh-ket-noi/meta",
    icon: MessagesSquare,
    status: "Sẵn sàng kết nối",
  },
] as const;

export function ConnectionChannelsPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="CRM Marketing"
        title="Kênh kết nối"
        scopeLabel="Tích hợp dữ liệu"
        description="Chọn nền tảng cần quản lý kết nối, tin nhắn và kết quả nhận diện ứng viên."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channels.map(({ title, description, href, icon: Icon, status }) => (
          <Card key={href} className="flex min-h-64 flex-col">
            <CardHeader>
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon aria-hidden="true" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{title}</CardTitle>
                <Badge variant="secondary">{status}</Badge>
              </div>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1" />
            <CardFooter>
              <Button className="w-full" asChild>
                <Link to={href}>Mở kênh <ChevronRight data-icon="inline-end" /></Link>
              </Button>
            </CardFooter>
          </Card>
        ))}

        <Card className="flex min-h-64 flex-col opacity-75">
          <CardHeader>
            <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Bot aria-hidden="true" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>TikTok Lead</CardTitle>
              <Badge variant="outline">Chưa hỗ trợ</Badge>
            </div>
            <CardDescription>Tiếp nhận lead từ biểu mẫu TikTok. Chức năng này sẽ được triển khai sau.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1" />
          <CardFooter>
            <Button className="w-full" disabled>Chưa khả dụng</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
