"use client";

import { Code2 } from "lucide-react";
import { type ComponentProps, type ReactNode, type RefObject, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailEmbedPanel } from "@/features/embed/email/email-embed-panel";
import { EMBED_MODES, type EmbedMode, previewUrl, sanitizeEmbedOptions } from "../options";
import { generateSnippet, type SnippetFormat } from "../snippets";
import type { EmbedTarget } from "../target";
import { EmbedCode } from "./embed-code";
import { EmbedPreview } from "./embed-preview";
import { type EmbedDraft, EmbedSettings, INITIAL_DRAFT } from "./embed-settings";
import { useIsPhone } from "./hooks";

type Tab = EmbedMode | "email";

const TAB_LABELS: Record<Tab, string> = {
  inline: "Inline",
  floating: "Floating button",
  popup: "Popup",
  email: "Email",
};

const DESCRIPTIONS: Record<EmbedTarget["kind"], string> = {
  profile: "Put your booking page on your website.",
  eventType: "Let people book this event type from your website.",
  team: "Put your team page on your website.",
  teamEventType: "Let people book this team event type from your website.",
  form: "Put this routing form on your website.",
};

/** One embed type: settings on the left, live preview and code on the right. */
function BuilderPane({
  mode,
  target,
  appUrl,
  draft,
  onDraft,
  format,
  onFormat,
}: {
  mode: EmbedMode;
  target: EmbedTarget;
  appUrl: string;
  draft: EmbedDraft;
  onDraft: (draft: EmbedDraft) => void;
  format: SnippetFormat;
  onFormat: (format: SnippetFormat) => void;
}) {
  const options = useMemo(() => sanitizeEmbedOptions(draft), [draft]);
  // iframe and link are alternatives to the inline embed only; the other modes are HTML.
  const effectiveFormat: SnippetFormat = mode === "inline" ? format : "html";
  const { code, error } = useMemo(() => {
    try {
      return { code: generateSnippet({ appUrl, target, mode, format: effectiveFormat, options }), error: null };
    } catch {
      return { code: "", error: "This link can't be embedded. Check the username or slug." };
    }
  }, [appUrl, target, mode, effectiveFormat, options]);
  // The preview shows the loader in this mode; the iframe/link formats render like inline.
  const previewMode = effectiveFormat === "html" ? mode : "inline";

  return (
    <div className="grid min-h-0 gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
      <div className="md:max-h-full md:overflow-y-auto md:pr-1">
        <EmbedSettings mode={mode} target={target} draft={draft} onChange={onDraft} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <EmbedPreview url={previewUrl({ calLink: target.calLink, mode: previewMode, options })} label={target.label} />
        <EmbedCode
          code={code}
          error={error}
          format={effectiveFormat}
          onFormat={mode === "inline" ? onFormat : undefined}
        />
      </div>
    </div>
  );
}

/** Tabs Inline · Floating button · Popup · Email (the last only for one bookable event type). */
function EmbedBuilder({ target, appUrl }: { target: EmbedTarget; appUrl: string }) {
  const [tab, setTab] = useState<Tab>("inline");
  const [draft, setDraft] = useState<EmbedDraft>(INITIAL_DRAFT);
  const [format, setFormat] = useState<SnippetFormat>("html");
  const tabs: Tab[] = target.booking ? [...EMBED_MODES, "email"] : [...EMBED_MODES];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-h-0 flex-1 gap-4">
      <div className="overflow-x-auto">
        <TabsList aria-label="Embed type" className="h-10! w-full md:w-fit">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="px-3">
              {TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {EMBED_MODES.map((mode) => (
        <TabsContent key={mode} value={mode} className="min-h-0">
          <BuilderPane
            mode={mode}
            target={target}
            appUrl={appUrl}
            draft={draft}
            onDraft={setDraft}
            format={format}
            onFormat={setFormat}
          />
        </TabsContent>
      ))}
      {target.booking && (
        <TabsContent value="email" className="min-h-0">
          <EmailEmbedPanel target={target} appUrl={appUrl} />
        </TabsContent>
      )}
    </Tabs>
  );
}

export type EmbedDialogProps = {
  target: EmbedTarget;
  /** Instance URL (APP_URL from getEnv(), passed down from the server). */
  appUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close when the dialog was opened without a trigger (e.g. from a menu). */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/** The embed builder: a large dialog, a bottom sheet on phones. */
export function EmbedDialog({ target, appUrl, open, onOpenChange, returnFocusRef }: EmbedDialogProps) {
  const phone = useIsPhone();
  const title = `Embed ${target.label}`;
  const description = DESCRIPTIONS[target.kind];
  const onCloseAutoFocus = (event: Event) => {
    if (!returnFocusRef?.current) return;
    event.preventDefault();
    returnFocusRef.current.focus();
  };
  const body = open ? <EmbedBuilder target={target} appUrl={appUrl} /> : null;

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" onCloseAutoFocus={onCloseAutoFocus} className="h-[92dvh] gap-0 rounded-t-xl p-0">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle className="break-words">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 overflow-y-auto p-6 sm:max-w-[1040px]"
      >
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="text-lg font-semibold break-words">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens the embed builder; for server-rendered pages. */
export function EmbedButton({
  target,
  appUrl,
  children = "Embed",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  target: EmbedTarget;
  appUrl: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" aria-haspopup="dialog" onClick={() => setOpen(true)} {...props}>
        <Code2 aria-hidden />
        {children}
      </Button>
      <EmbedDialog target={target} appUrl={appUrl} open={open} onOpenChange={setOpen} />
    </>
  );
}
