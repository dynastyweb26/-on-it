// Route entry only. The tab deck mounts the same view directly; this wrapper
// keeps a direct load and a deck render on one component.
import ClientsView from '@/components/tabs/ClientsView';

export default function Page() {
  return <ClientsView />;
}
