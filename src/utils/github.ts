import { Octokit } from "@octokit/rest";

let octokit: Octokit | null = null;

export const initializeOctokit = (accessToken: string) => {
  octokit = new Octokit({ auth: accessToken });
};

const ensureOctokit = () => {
  if (!octokit) throw new Error("Octokit not initialized");
  return octokit;
};

export const getRepositories = async () => {
  const client = ensureOctokit();
  try {
    console.log('Fetching repositories');
    const { data } = await client.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });
    console.log(`Successfully fetched ${data.length} repositories`);
    return data.map(repo => ({ 
      value: repo.full_name, 
      label: repo.full_name,
      owner: repo.owner.login,
    }));
  } catch (error) {
    console.error('Error fetching repositories:', error);
    throw error;
  }
};

export const getDeployments = async (full_name: string) => {
  const client = ensureOctokit();
  const [owner, repo] = full_name.split('/');
  try {
    const { data } = await client.repos.listDeployments({ owner, repo });
    return Promise.all(data.map(async (deployment) => {
      const { data: deploymentStatus } = await client.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id: deployment.id
      });
      
      // Fetch release tag
      let releaseTag = '';
      try {
        const { data: release } = await client.repos.getReleaseByTag({
          owner,
          repo,
          tag: deployment.ref
        });
        releaseTag = release.tag_name;
      } catch (error) {
        console.log(`No release found for ref: ${deployment.ref}`);
      }

      return {
        id: deployment.id,
        sha: deployment.sha,
        ref: deployment.ref,
        task: deployment.task,
        environment: deployment.environment,
        description: deployment.description || '',
        creator: deployment.creator ? {
          login: deployment.creator.login,
          avatar_url: deployment.creator.avatar_url
        } : null,
        created_at: deployment.created_at,
        updated_at: deployment.updated_at,
        statuses_url: deployment.statuses_url,
        repository_url: deployment.repository_url,
        status: deploymentStatus[0]?.state || 'unknown',
        releaseTag: releaseTag
      };
    }));
  } catch (error) {
    console.error(`Error fetching deployments for ${full_name}:`, error);
    throw error;
  }
};

export const getEnvironments = async (full_name: string) => {
  const client = ensureOctokit();
  const [owner, repo] = full_name.split('/');
  try {
    const { data } = await client.repos.getAllEnvironments({ owner, repo });
    return data.environments || [];
  } catch (error) {
    console.error(`Error fetching environments for ${full_name}:`, error);
    throw error;
  }
};