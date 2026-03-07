import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { Sidebar, Topbar } from "@/components/layout";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <div className="ascension-dark flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Topbar user={session?.user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
