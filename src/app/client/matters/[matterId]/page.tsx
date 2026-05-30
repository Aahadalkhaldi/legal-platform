import ClientPortalClient from "../../client-portal-client";

export default async function ClientMatterDetailPage({
  params,
}: {
  params: Promise<{ matterId: string }>;
}) {
  const { matterId } = await params;
  return <ClientPortalClient section="matter-detail" matterId={matterId} />;
}
