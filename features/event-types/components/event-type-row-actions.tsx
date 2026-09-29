"use client";

import { ArrowDown, ArrowUp, Copy as DuplicateIcon, Ellipsis, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import {
  deleteEventTypeAction,
  duplicateEventTypeAction,
  moveEventTypeAction,
  toggleEventTypeAction,
} from "../server/actions";

const iconButton = "size-11 rounded-md text-muted-foreground md:size-9";

/** The row's on/off switch: flips at once, then the server action confirms it. */
export function EventTypeSwitch({ id, title, enabled }: { id: string; title: string; enabled: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex h-11 items-center md:h-9">
      <Switch
        checked={optimistic}
        disabled={pending}
        aria-label={`${title} can be booked`}
        onCheckedChange={(checked) =>
          startTransition(async () => {
            setOptimistic(checked);
            await toggleEventTypeAction(id, checked);
          })
        }
      />
    </span>
  );
}

/** Copy link and the "…" menu: edit, duplicate, reorder, delete (with confirmation). */
export function EventTypeRowMenu({
  id,
  title,
  url,
  first,
  last,
}: {
  id: string;
  title: string;
  url: string | null;
  first: boolean;
  last: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<void>) => startTransition(action);

  return (
    <div className="flex items-center gap-0.5">
      {url ? (
        <CopyButton
          value={url}
          variant="ghost"
          size="icon"
          aria-label={`Copy link to ${title}`}
          className={iconButton}
        />
      ) : (
        <span aria-hidden className="size-11 md:size-9" />
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${title}`}
            disabled={pending}
            className={iconButton}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/event-types/${id}`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => duplicateEventTypeAction(id))}>
            <DuplicateIcon aria-hidden />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem disabled={first} onSelect={() => run(() => moveEventTypeAction(id, "up"))}>
            <ArrowUp aria-hidden />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => run(() => moveEventTypeAction(id, "down"))}>
            <ArrowDown aria-hidden />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its booking link stops working and this can’t be undone. An event type with upcoming bookings can’t be
              deleted: turn it off instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => deleteEventTypeAction(id))}>
              Delete event type
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
