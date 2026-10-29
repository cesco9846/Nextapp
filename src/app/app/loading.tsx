import { LoadingState } from "@/components/states";

export default function WorkspaceLoading() {
  return (
    <div className="page-container">
      <LoadingState label="Apertura della schermata…" />
    </div>
  );
}
