type CheckedRun = {
  id: number;
  name: string;
  path: string;
  event: string;
  head_branch: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  repository: { full_name: string };
  head_repository: { full_name: string };
};

export function checkedReleaseSha(run: CheckedRun, latestMain: string) {
  if (
    run.name !== "Application checks" ||
    run.path !== ".github/workflows/ci.yml" ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.repository?.full_name !== "cesco9846/Nextapp" ||
    run.head_repository?.full_name !== "cesco9846/Nextapp" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !/^[a-f0-9]{40}$/.test(run.head_sha)
  )
    throw new Error("Release requires a successful trusted main CI run");
  return run.head_sha === latestMain ? run.head_sha : null;
}
