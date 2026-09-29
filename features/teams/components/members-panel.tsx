"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionState } from "@/lib/actions";
import { initials, ROLE_LABELS } from "../overview";
import { TEAM_ROLES, type TeamRole } from "../roles";
import { PayloadForm } from "./payload-form";

type Member = { userId: string; name: string; email: string; role: TeamRole };
type Invitation = { id: string; email: string; role: TeamRole; expires: string };

type Actions = {
  changeRole: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  remove: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  invite: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  cancelInvitation: (invitationId: string) => Promise<void>;
};

type FutureBookings = "reassign" | "cancel";

function RoleSelect({
  id,
  value,
  onValueChange,
  className,
}: {
  id: string;
  value: TeamRole;
  onValueChange: (role: TeamRole) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as TeamRole)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TEAM_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MemberRow({
  member,
  canManage,
  isSelf,
  actions,
}: {
  member: Member;
  canManage: boolean;
  isSelf: boolean;
  actions: Actions;
}) {
  const [role, setRole] = useState<TeamRole>(member.role);
  const [futureBookings, setFutureBookings] = useState<FutureBookings>("reassign");
  const id = member.userId;
  return (
    <li className="flex flex-col gap-3 px-4 py-3 text-sm">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
        >
          {initials(member.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-medium">
            {member.name}
            {isSelf && <span className="text-muted-foreground"> (you)</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        </div>
        <Badge variant={member.role === "member" ? "outline" : "muted"} className={member.role === "member" ? "text-muted-foreground" : undefined}>
          {ROLE_LABELS[member.role]}
        </Badge>
      </div>
      {canManage && (
        <div className="flex flex-wrap items-end gap-4">
          <PayloadForm
            action={actions.changeRole}
            payload={{ userId: id, role }}
            submitLabel="Change role"
            variant="outline"
            className="flex flex-wrap items-end gap-2"
          >
            {() => (
              <FormField label="Role" htmlFor={`role-${id}`} className="w-auto">
                <RoleSelect id={`role-${id}`} value={role} onValueChange={setRole} className="w-32" />
              </FormField>
            )}
          </PayloadForm>
          <PayloadForm
            action={actions.remove}
            payload={{ userId: id, futureBookings }}
            submitLabel={isSelf ? "Leave team" : "Remove"}
            submitAriaLabel={isSelf ? "Leave team" : `Remove ${member.name}`}
            variant="destructive"
            className="flex flex-wrap items-end gap-2"
          >
            {() => (
              <FormField label="Their future team bookings" htmlFor={`future-${id}`} className="w-auto">
                <Select value={futureBookings} onValueChange={(v) => setFutureBookings(v as FutureBookings)}>
                  <SelectTrigger id={`future-${id}`} className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reassign">Reassign to other hosts</SelectItem>
                    <SelectItem value="cancel">Cancel them</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </PayloadForm>
        </div>
      )}
    </li>
  );
}

/** Members, roles, invitations (TEAM-002/003). Buttons follow the role; the server re-checks. */
export function MembersPanel({
  members,
  invitations,
  selfId,
  canManage,
  actions,
}: {
  members: Member[];
  invitations: Invitation[];
  selfId: string;
  canManage: boolean;
  actions: Actions;
}) {
  const [invite, setInvite] = useState<{ email: string; role: TeamRole }>({ email: "", role: "member" });
  const self = members.find((m) => m.userId === selfId);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Members</h2>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {members.map((m) => (
          <MemberRow key={m.userId} member={m} canManage={canManage} isSelf={m.userId === selfId} actions={actions} />
        ))}
      </ul>
      {!canManage && self && (
        <PayloadForm
          action={actions.remove}
          payload={{ userId: selfId, futureBookings: "reassign" }}
          submitLabel="Leave team"
          variant="outline"
        />
      )}
      {canManage && (
        <>
          <h3 id="invite" className="scroll-mt-6 text-sm font-semibold">
            Invite someone
          </h3>
          <PayloadForm
            action={actions.invite}
            payload={invite}
            submitLabel="Send invitation"
            className="flex flex-col gap-3"
          >
            {(errors) => (
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <FormField label="Email" htmlFor="invite-email" error={errors.email}>
                  <Input
                    id="invite-email"
                    type="email"
                    value={invite.email}
                    onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))}
                  />
                </FormField>
                <FormField label="Role" htmlFor="invite-role">
                  <RoleSelect
                    id="invite-role"
                    value={invite.role}
                    onValueChange={(role) => setInvite((v) => ({ ...v, role }))}
                    className="w-full"
                  />
                </FormField>
              </div>
            )}
          </PayloadForm>
          {invitations.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {invitations.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-dashed border-input px-3 py-2"
                >
                  <span>
                    {i.email} · {i.role} · pending until {i.expires}
                  </span>
                  <form action={actions.cancelInvitation.bind(null, i.id)}>
                    <Button variant="ghost" size="sm" aria-label={`Cancel invitation for ${i.email}`}>
                      Cancel
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
