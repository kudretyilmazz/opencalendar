import { Plus } from "lucide-react";
import type { ActionState } from "@/lib/actions";
import { TeamForm } from "./team-form";

/** The dashed "Create a team" tile at the end of the grid, with the new-team form inside (TEAM-001). */
export function CreateTeamCard({
  action,
  appUrl,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  appUrl: string;
}) {
  return (
    <section
      id="create-team"
      aria-labelledby="create-team-heading"
      className="flex scroll-mt-6 flex-col gap-4 rounded-[12px] border border-dashed border-input p-5"
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-muted">
          <Plus className="size-5" />
        </span>
        <h2 id="create-team-heading" className="text-[15px] font-semibold">
          Create a team
        </h2>
        <p className="max-w-[240px] text-[13px] leading-normal text-muted-foreground">
          Invite people by email, then share event types that book whoever is free.
        </p>
      </div>
      <TeamForm action={action} appUrl={appUrl} submitLabel="Create team" stacked />
    </section>
  );
}
