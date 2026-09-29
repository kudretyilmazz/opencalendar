"use client";

import { useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { disconnectAction } from "../server/actions";

/** Ghost "Disconnect" button with an AlertDialog confirmation. */
export function DisconnectButton({ credentialId, name }: { credentialId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" className="h-9 rounded-md px-3 text-[13px] text-muted-foreground" aria-label={`Disconnect ${name}`}>
          Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
          <AlertDialogDescription>Its calendars stop blocking your slots and new bookings are no longer added to them.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10 rounded-md">Cancel</AlertDialogCancel>
          <Button
            type="button"
            disabled={pending}
            className="h-10 rounded-md bg-destructive-soft px-3.5 text-destructive hover:bg-destructive-soft/80"
            onClick={() => startTransition(() => disconnectAction(credentialId))}
          >
            {pending && <Spinner />}
            Disconnect
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
