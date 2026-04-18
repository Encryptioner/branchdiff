import { useRouteError, useNavigate } from "react-router";
import type { Route } from "./+types/diff";
import { queryClient } from "../lib/query-client";
import { diffOptions } from "../queries/diff";
import { repoInfoOptions } from "../queries/info";
import { branchComparisonOptions, branchCommitsOptions } from "../queries/branch-comparison";
import { DiffPage } from "../components/diff/diff-page";
import { ErrorPage } from "../components/error-page";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") || "work";
  const theme = url.searchParams.get("theme") as "light" | "dark" | null;
  const view = url.searchParams.get("view") as "split" | "unified" | null;
  const b1 = url.searchParams.get("b1");
  const b2 = url.searchParams.get("b2");
  const mode = url.searchParams.get("mode") as "file" | "git" | "delta" | null;

  const isBranchComparison = !!(b1 && b2);

  // Only await repoInfo (fast, needed for toolbar name on first paint).
  // Everything else prefetches in the background — components handle their own loading states.
  if (isBranchComparison) {
    if (mode === 'delta') {
      queryClient.prefetchQuery(branchComparisonOptions(b1, b2, 'file'));
      queryClient.prefetchQuery(branchComparisonOptions(b1, b2, 'git'));
    } else {
      queryClient.prefetchQuery(branchComparisonOptions(b1, b2, mode ?? 'git'));
    }
    queryClient.prefetchQuery(branchCommitsOptions(b1, b2));
  } else {
    queryClient.prefetchQuery(diffOptions(false, ref));
  }

  await queryClient.ensureQueryData(repoInfoOptions(ref));

  return { ref, theme, view, b1: b1 ?? null, b2: b2 ?? null, mode: (mode ?? "git") as "file" | "git" | "delta" };
}

export default function DiffRoute({ loaderData }: Route.ComponentProps) {
  return <DiffPage />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <ErrorPage
      error={error}
      actions={[
        { label: "View working changes", primary: true, onClick: () => navigate("/diff") },
        { label: "Browse files", onClick: () => navigate("/tree") },
      ]}
    />
  );
}
