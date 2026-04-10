import { useRouteError, useNavigate } from "react-router";
import type { Route } from "./+types/tour.$tourId.$step";
import { queryClient } from "../lib/query-client";
import { treePathsOptions, treeInfoOptions, treeFileContentOptions, tourOptions } from "../queries/tree";
import { TreePage } from "../components/tree/tree-page";
import { ErrorPage } from "../components/error-page";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const tourId = params.tourId;
  const stepIndex = parseInt(params.step, 10);

  const [tour] = await Promise.all([
    queryClient.ensureQueryData(tourOptions(tourId)),
    queryClient.ensureQueryData(treePathsOptions()),
    queryClient.ensureQueryData(treeInfoOptions()),
  ]);

  if (stepIndex > 0) {
    const step = tour.steps[stepIndex - 1];
    if (step) {
      try {
        await queryClient.ensureQueryData(treeFileContentOptions(step.filePath));
      } catch {
        // File may not exist — the viewer will handle the missing content
      }
    }
  }

  return { tourId, stepIndex };
}

export default function TourStepRoute({ loaderData }: Route.ComponentProps) {
  return <TreePage tourId={loaderData.tourId} tourStepIndex={loaderData.stepIndex} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <ErrorPage
      error={error}
      actions={[
        { label: "Go back", primary: true, onClick: () => navigate(-1) },
        { label: "Browse files", onClick: () => navigate("/tree") },
      ]}
    />
  );
}
