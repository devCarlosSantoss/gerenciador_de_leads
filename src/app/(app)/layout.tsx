import { Shell } from "@/components/shell";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return <Shell user={user}>{children}</Shell>;
}