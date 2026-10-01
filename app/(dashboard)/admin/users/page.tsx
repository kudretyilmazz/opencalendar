import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { UserActions } from "@/features/admin-users/components/user-actions";
import { listUsers, type UserFilter, USERS_PAGE_SIZE } from "@/features/admin-users/server/service";
import { settingsCardClass } from "@/features/settings/components/settings-section";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Users" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function parseFilter(params: Record<string, string | string[] | undefined>): UserFilter {
  const role = one(params.role);
  const status = one(params.status);
  const page = Number(one(params.page));
  return {
    query: one(params.q)?.slice(0, 100),
    role: role === "admin" || role === "user" ? role : undefined,
    status: status === "active" || status === "disabled" ? status : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

const SELECT_CLASS = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const filter = parseFilter(await searchParams);
  const { rows, total } = await listUsers(getDb(), filter);
  const page = filter.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const pageHref = (p: number) => {
    const qs = new URLSearchParams({ ...(filter.query && { q: filter.query }), ...(filter.role && { role: filter.role }), ...(filter.status && { status: filter.status }), page: String(p) });
    return `/admin/users?${qs}`;
  };

  return (
    <>
      <PageHeader title="Users" description={`${total} ${total === 1 ? "account" : "accounts"} on this instance.`} />
      <form role="search" className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={filter.query ?? ""} placeholder="Search name, email or username" aria-label="Search users" className="h-10 max-w-80 rounded-md" />
        <select name="role" defaultValue={filter.role ?? ""} aria-label="Role" className={SELECT_CLASS}>
          <option value="">All roles</option>
          <option value="admin">Administrators</option>
          <option value="user">Members</option>
        </select>
        <select name="status" defaultValue={filter.status ?? ""} aria-label="Status" className={SELECT_CLASS}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <Button type="submit" variant="outline" className="h-10 rounded-md">
          Filter
        </Button>
      </form>
      <div className={settingsCardClass}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Account</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
              <TableHead className="hidden md:table-cell">Last active</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No accounts match.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id} data-testid={`user-row-${row.email}`}>
                <TableCell className="pl-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{row.email}</span>
                  </div>
                </TableCell>
                <TableCell>{row.role === "admin" ? <Badge>Administrator</Badge> : <span className="text-sm text-muted-foreground">Member</span>}</TableCell>
                <TableCell>
                  {row.disabledAt ? (
                    <Badge variant="destructive">Disabled</Badge>
                  ) : row.emailVerified ? (
                    <span className="text-sm">Active</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unverified</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">{dateFormat.format(row.createdAt)}</TableCell>
                <TableCell className="hidden text-sm md:table-cell">{row.lastSeenAt ? dateFormat.format(row.lastSeenAt) : "—"}</TableCell>
                <TableCell className="pr-4">
                  <UserActions
                    isSelf={row.id === admin.id}
                    target={{ id: row.id, name: row.name, email: row.email, role: row.role, disabled: row.disabledAt !== null }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-end gap-2 text-sm">
          {page > 1 && (
            <Button asChild variant="outline" className="h-9">
              <Link href={pageHref(page - 1)}>Previous</Link>
            </Button>
          )}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Button asChild variant="outline" className="h-9">
              <Link href={pageHref(page + 1)}>Next</Link>
            </Button>
          )}
        </nav>
      )}
    </>
  );
}
