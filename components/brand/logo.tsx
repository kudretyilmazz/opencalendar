import { Calendar } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/db/client";
import { assetUrl } from "@/features/instance/defaults";
import { getInstanceSettings } from "@/features/instance/server/service";
import { cn } from "@/lib/cn";

/**
 * The instance logo (ADM-011): the uploaded image (with its dark-mode variant when there is
 * one), else the built-in mark next to the app name.
 */
export async function BrandLogo({ href, className }: { href: string; className?: string }) {
  const settings = await getInstanceSettings(getDb());
  const { logo, logo_dark: logoDark } = settings.assets;
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-[-0.01em]", className)}>
      {logo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- served from our own route, any size/format */}
          <img src={assetUrl(settings, "logo")} alt={settings.appName} className={cn("h-[30px] w-auto max-w-[180px] object-contain", logoDark && "dark:hidden")} />
          {logoDark && (
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img src={assetUrl(settings, "logo_dark")} alt={settings.appName} className="hidden h-[30px] w-auto max-w-[180px] object-contain dark:block" />
          )}
        </>
      ) : (
        <>
          <span className="flex size-[30px] items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Calendar className="size-4" aria-hidden />
          </span>
          {settings.appName}
        </>
      )}
    </Link>
  );
}
