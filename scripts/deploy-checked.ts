/** Promote only a checked main commit. Same gate can precede the future VPS deploy. */
import { checkedReleaseSha } from "../src/lib/release-gate";

const runId = process.env.CI_SOURCE_RUN_ID ?? process.argv[2];
if (!runId || !/^\d+$/.test(runId))
  throw Error("Pass the source Application checks run id");
const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const vercelToken = process.env.VERCEL_TOKEN;
const team = "team_yUX5Fj5mWKEDZNZI99Sgzb3X";
const project = "prj_v5J1Oc43amxd1MKJU8MQdkYoIfkf";
async function github(path: string) {
  const response = await fetch(
    `https://api.github.com/repos/cesco9846/Nextapp/${path}`,
    {
      headers: githubToken ? { Authorization: `Bearer ${githubToken}` } : {},
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw Error(`GitHub release check: HTTP ${response.status}`);
  return response.json();
}
const [run, main] = await Promise.all([
  github(`actions/runs/${runId}`),
  github("git/ref/heads/main"),
]);
const sha = checkedReleaseSha(run, main.object.sha);
if (!sha) {
  console.log("Checked commit superseded by main; production unchanged.");
} else {
  if (!vercelToken)
    throw Error(
      "Configure the repository Actions secret VERCEL_TOKEN to enable checked deployment.",
    );
  async function vercel(path: string, body?: object) {
    const response = await fetch(
      `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${team}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw Error(`Vercel checked deployment: HTTP ${response.status}`);
    return response.json();
  }
  const existing = await vercel(
    `/v6/deployments?projectId=${project}&limit=10`,
  );
  let deployment = existing.deployments.find(
    (d: {
      meta?: { glowCiRun?: string; githubCommitSha?: string };
      state: string;
    }) =>
      d.meta?.glowCiRun === runId &&
      d.meta?.githubCommitSha === sha &&
      !["ERROR", "CANCELED"].includes(d.state),
  );
  if (!deployment) {
    // Check again after lookup; never ask Vercel to build a moving branch ref.
    const current = await github("git/ref/heads/main");
    if (current.object.sha !== sha)
      throw Error("Main changed before deployment; retry its checked run.");
    deployment = await vercel("/v13/deployments", {
      name: "glow",
      project,
      target: "production",
      gitSource: { type: "github", repoId: 1420374170, ref: sha, sha },
      meta: { glowCiRun: runId, githubCommitSha: sha },
    });
  }
  const deploymentId = deployment.uid ?? deployment.id;
  if (!/^dpl_[a-zA-Z0-9]+$/.test(deploymentId))
    throw Error("Unexpected deployment identity");
  let previous = "";
  let ready = false;
  for (let n = 0; n < 90; n++) {
    const state = await vercel(`/v13/deployments/${deploymentId}`);
    if (state.readyState !== previous) {
      console.log(
        JSON.stringify({
          sha,
          deployment: deploymentId,
          state: state.readyState,
        }),
      );
      previous = state.readyState;
    }
    if (state.readyState === "READY") {
      if (state.meta?.githubCommitSha !== sha)
        throw Error("Deployment does not match checked source");
      ready = true;
      break;
    }
    if (["ERROR", "CANCELED"].includes(state.readyState))
      throw Error(
        "Checked deployment failed; inspect Vercel build diagnostics",
      );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  if (!ready) throw Error("Deployment verification timed out");
}
