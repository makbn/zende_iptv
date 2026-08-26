import { Button } from "@appica/ui-react/button";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@appica/ui-react/alert-dialog";
import { ZendeSpinner } from "@/components/loading/zende-spinner";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AppicaConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent frame>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogBody />
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="secondary" disabled={busy} />}
          >
            {cancelLabel}
          </AlertDialogClose>
          <Button
            type="button"
            variant={destructive ? "destructive" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <><ZendeSpinner size="tiny" label="Working" /> Working…</> : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
