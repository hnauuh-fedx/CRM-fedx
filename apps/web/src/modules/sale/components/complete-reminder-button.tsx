import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { completeSaleReminder } from "@/services/sale.service";

export function CompleteReminderButton({ reminderId, accessToken }: { reminderId: string; accessToken: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => completeSaleReminder(reminderId, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sale", "reminders"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  return (
    <Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      <Check data-icon="inline-start" aria-hidden="true" />Hoàn tất
    </Button>
  );
}
